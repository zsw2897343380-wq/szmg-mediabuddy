package main

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed assets/*
var assets embed.FS

const trayDoubleClick = 400 * time.Millisecond

// Set at release build time to direct packaged desktop apps to their service.
// OCTOP_DESKTOP_URL at process startup still takes precedence.
var bundledDesktopURL string

// App is the Wails service bound to the shell UI.
type App struct {
	app            *application.App
	window         *application.WebviewWindow
	settingsWindow *application.WebviewWindow
	store          *settingsStore
	sleep          *sleepGuard
	cmd            *exec.Cmd
	mu             sync.Mutex
	quitting       bool

	trayClickMu    sync.Mutex
	lastTrayClick  time.Time
	trayClickTimer *time.Timer
	mainWindowReady chan struct{}
	mainWindowReadyOnce sync.Once
}

func (a *App) ServiceName() string { return "desktop" }

func (a *App) ServiceStartup(context.Context, application.ServiceOptions) error {
	log.Printf("[lifecycle] service startup")
	return nil
}

func (a *App) ServiceShutdown() error {
	log.Printf("[lifecycle] service shutdown begin")
	a.sleep.stop()
	a.mu.Lock()
	cmd := a.cmd
	a.cmd = nil
	a.mu.Unlock()
	stopOctop(cmd)
	log.Printf("[lifecycle] service shutdown complete")
	return nil
}

func (a *App) GetSettings() Settings {
	return a.store.get()
}

func (a *App) GetSettingsStatus() (Settings, error) {
	s := a.store.get()
	if a.app == nil {
		return s, nil
	}
	status, err := a.app.Autostart.Status()
	if err != nil {
		return s, fmt.Errorf("read autostart status: %w", err)
	}
	if s.Autostart != status.Enabled {
		s.Autostart = status.Enabled
		if err := a.store.save(s); err != nil {
			return s, err
		}
	}
	return s, nil
}

func (a *App) SaveSettings(next Settings) (Settings, error) {
	cur, err := a.GetSettingsStatus()
	if err != nil {
		return cur, err
	}
	autostart, err := a.setAutostart(next.Autostart)
	if err != nil {
		return cur, err
	}
	if err := a.sleep.set(next.PreventSleep); err != nil {
		if _, rollbackErr := a.setAutostart(cur.Autostart); rollbackErr != nil {
			log.Printf("rollback autostart after sleep prevention failure: %v", rollbackErr)
		}
		return cur, err
	}
	next.Autostart = autostart
	if err := a.store.save(next); err != nil {
		return cur, err
	}
	saved := a.store.get()
	a.applyDashboardPrefs(saved)
	return saved, nil
}

func (a *App) ShowMain() {
	a.showWindow()
}

func (a *App) HideSettings() {
	if a.settingsWindow == nil {
		return
	}
	a.settingsWindow.Hide()
}

func (a *App) Quit() {
	a.requestQuit()
}

func (a *App) setAutostart(on bool) (bool, error) {
	if a.app == nil {
		return false, fmt.Errorf("autostart is unavailable before the application starts")
	}
	if on {
		if err := a.app.Autostart.Enable(); err != nil {
			return false, fmt.Errorf("enable autostart: %w", err)
		}
	} else if err := a.app.Autostart.Disable(); err != nil {
		return false, fmt.Errorf("disable autostart: %w", err)
	}
	status, err := a.app.Autostart.Status()
	if err != nil {
		return false, fmt.Errorf("read autostart status: %w", err)
	}
	if status.Enabled != on {
		return status.Enabled, fmt.Errorf("autostart state did not update")
	}
	return status.Enabled, nil
}

func (a *App) applyDashboardPrefs(s Settings) {
	if a.window == nil {
		return
	}
	js := fmt.Sprintf(
		`(function(){try{localStorage.setItem('octop:ui-locale',%s);}catch(e){}})();`,
		jsonString(string(s.Locale)),
	)
	a.window.ExecJS(js)
}

func jsonString(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

func (a *App) setStatus(msg string) {
	if a.app == nil {
		return
	}
	a.app.Event.Emit("desktop:status", msg)
}

func (a *App) boot() {
	started := time.Now()
	log.Printf("[boot] begin")
	locale := LocaleEN
	if a.store != nil {
		locale = a.store.get().Locale
	}
	url := os.Getenv("OCTOP_DESKTOP_URL")
	if url == "" {
		url = bundledDesktopURL
	}
	if url != "" {
		log.Printf("[boot] waiting for configured dashboard health")
		healthStarted := time.Now()
		a.setStatus(desktopText(locale, copyStatusConnecting))
		if err := waitHealth(locale, url, 60*time.Second); err != nil {
			log.Printf("[boot] configured dashboard health failed after %s: %v", time.Since(healthStarted), err)
			a.setStatus(err.Error())
			return
		}
		log.Printf("[boot] configured dashboard healthy after %s", time.Since(healthStarted))
		a.showDashboard(url)
		log.Printf("[boot] complete after %s", time.Since(started))
		return
	}
	s := a.store.get()
	log.Printf("[boot] checking bundled runtime")
	a.setStatus(desktopText(locale, copyStatusCheckingRuntime))
	runtimeStarted := time.Now()
	if err := ensurePortable(locale, a.setStatus); err != nil {
		log.Printf("[boot] bundled runtime check failed after %s: %v", time.Since(runtimeStarted), err)
		a.setStatus(err.Error())
		return
	}
	log.Printf("[boot] bundled runtime ready after %s", time.Since(runtimeStarted))
	root := portableDir()
	log.Printf("[boot] starting local Octop service on port %d", s.Port)
	startStarted := time.Now()
	a.mu.Lock()
	stopOctop(a.cmd)
	cmd, err := startOctop(root, s.Port)
	a.cmd = cmd
	a.mu.Unlock()
	if err != nil {
		log.Printf("[boot] local Octop start failed after %s: %v", time.Since(startStarted), err)
		a.setStatus(err.Error())
		return
	}
	log.Printf("[boot] local Octop process started after %s", time.Since(startStarted))
	base := dashboardURL(s.Port)
	a.setStatus(desktopText(locale, copyStatusStartingService))
	healthStarted := time.Now()
	log.Printf("[boot] waiting for local Octop health")
	if err := waitHealth(locale, base, 2*time.Minute); err != nil {
		log.Printf("[boot] local Octop health failed after %s: %v", time.Since(healthStarted), err)
		a.setStatus(err.Error())
		return
	}
	log.Printf("[boot] local Octop healthy after %s", time.Since(healthStarted))
	a.showDashboard(base)
	log.Printf("[boot] complete after %s", time.Since(started))
}

func (a *App) showDashboard(base string) {
	if a.window == nil {
		return
	}
	if a.mainWindowReady != nil {
		log.Printf("[boot] waiting for initial main window navigation")
		timer := time.NewTimer(15 * time.Second)
		defer timer.Stop()
		select {
		case <-a.mainWindowReady:
			log.Printf("[boot] initial main window navigation completed")
		case <-timer.C:
			log.Printf("[boot] timed out waiting for initial main window navigation; keeping the application open")
			return
		}
	}
	log.Printf("[boot] setting main window dashboard URL")
	a.window.SetURL(base)
	log.Printf("[boot] main window dashboard URL set")
	a.scheduleDragOverlay()
	s := a.store.get()
	go func() {
		time.Sleep(800 * time.Millisecond)
		a.applyDashboardPrefs(s)
	}()
	a.setStatus(desktopText(s.Locale, copyStatusReady))
	log.Printf("[boot] dashboard shown and ready status emitted")
}

func (a *App) hideToTray() {
	if a.window == nil {
		return
	}
	a.window.Hide()
}

func (a *App) showWindow() {
	if a.window == nil {
		return
	}
	if a.window.IsMinimised() {
		a.window.UnMinimise()
	}
	a.window.Show()
	a.window.Focus()
}

func (a *App) toggleMainWindow() {
	if a.window == nil {
		return
	}
	if a.window.IsVisible() && !a.window.IsMinimised() {
		a.hideToTray()
		return
	}
	a.showWindow()
}

func (a *App) onTrayLeftClick() {
	a.trayClickMu.Lock()
	defer a.trayClickMu.Unlock()
	if a.trayClickTimer != nil {
		a.trayClickTimer.Stop()
		a.trayClickTimer = nil
	}
	now := time.Now()
	if !a.lastTrayClick.IsZero() && now.Sub(a.lastTrayClick) < trayDoubleClick {
		a.lastTrayClick = time.Time{}
		go a.toggleMainWindow()
		return
	}
	a.lastTrayClick = now
	a.trayClickTimer = time.AfterFunc(trayDoubleClick, func() {
		a.trayClickMu.Lock()
		a.trayClickTimer = nil
		a.trayClickMu.Unlock()
		a.showWindow()
	})
}

func (a *App) installDragOverlay() {
	if a.window == nil {
		return
	}
	a.window.ExecJS(dragOverlayJS())
}

func (a *App) scheduleDragOverlay() {
	go func() {
		for range 40 {
			time.Sleep(250 * time.Millisecond)
			a.installDragOverlay()
			a.installExternalLinks()
		}
	}()
}

func (a *App) requestQuit() {
	a.mu.Lock()
	a.quitting = true
	a.mu.Unlock()
	if a.app != nil {
		a.app.Quit()
	}
}

func configureStartupLog() {
	home := octopHome()
	log.Printf("[startup] log directory: %s; pid=%d", home, os.Getpid())
	if err := os.MkdirAll(home, 0o700); err != nil {
		return
	}
	file, err := os.OpenFile(filepath.Join(home, "desktop.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return
	}
	log.SetOutput(file)
	log.SetFlags(log.Ldate | log.Ltime | log.Lmicroseconds)
	log.Printf("----- MediaBuddy desktop starting (goos=%s goarch=%s pid=%d) -----", runtime.GOOS, runtime.GOARCH, os.Getpid())
}

func logStartupPanic(stage string) {
	if recovered := recover(); recovered != nil {
		log.Printf("panic during %s: %v\n%s", stage, recovered, debug.Stack())
	}
}

func main() {
	configureStartupLog()
	defer logStartupPanic("main")
	log.Printf("[startup] loading settings")
	store := &settingsStore{cur: loadSettings()}
	log.Printf("[startup] settings loaded")
	api := &App{
		store:           store,
		sleep:           &sleepGuard{},
		mainWindowReady: make(chan struct{}),
	}

	log.Printf("[startup] creating Wails application")
	app := application.New(application.Options{
		Name:        "MediaBuddy",
		Description: "MediaBuddy desktop client",
		Services: []application.Service{
			application.NewService(api),
		},
		Assets: application.AssetOptions{
			Handler: application.BundledAssetFileServer(assets),
		},
		Windows: application.WindowsOptions{
			DisableQuitOnLastWindowClosed: true,
		},
		Linux: application.LinuxOptions{
			DisableQuitOnLastWindowClosed: true,
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: false,
		},
	})
	log.Printf("[startup] Wails application created")
	api.app = app
	attachOpenURLEventListener(app, api.OpenExternal)
	app.Event.OnApplicationEvent(events.Common.ApplicationStarted, func(_ *application.ApplicationEvent) {
		applyAppIcon(app)
	})

	log.Printf("[startup] creating main window")
	win := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:                "MediaBuddy",
		Width:                1200,
		Height:               800,
		URL:                  "/",
		Frameless:            true,
		AllowSimpleEventEmit: true,
		BackgroundColour:     application.NewRGB(247, 248, 250),
	})
	log.Printf("[startup] main window created")
	api.window = win
	app.Event.On("desktop:toggle-maximise", func(_ *application.CustomEvent) {
		win.ToggleMaximise()
	})
	app.Event.On("desktop:minimise", func(_ *application.CustomEvent) {
		win.Minimise()
	})
	app.Event.On("desktop:close", func(_ *application.CustomEvent) {
		log.Printf("[window] close button requested hide-to-tray")
		api.hideToTray()
	})
	installDragOverlay := func(_ *application.WindowEvent) {
		api.mainWindowReadyOnce.Do(func() { close(api.mainWindowReady) })
		log.Printf("[window] main WebView navigation completed")
		api.scheduleDragOverlay()
	}
	win.OnWindowEvent(events.Mac.WebViewDidFinishNavigation, installDragOverlay)
	win.OnWindowEvent(events.Windows.WebViewNavigationCompleted, installDragOverlay)
	win.OnWindowEvent(events.Linux.WindowLoadFinished, installDragOverlay)
	log.Printf("[startup] creating hidden settings window")
	settingsWin := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "MediaBuddy 设置",
		Width:            settingsWindowWidth,
		Height:           settingsWindowOuterHeight(),
		URL:              "/?settings=1",
		Hidden:           true,
		Frameless:        true,
		AlwaysOnTop:      true,
		DisableResize:    true,
		BackgroundColour: application.NewRGB(255, 255, 255),
		Windows: application.WindowsWindow{
			HiddenOnTaskbar: true,
		},
	})
	log.Printf("[startup] hidden settings window created")
	api.settingsWindow = settingsWin
	app.Event.RegisterApplicationEventHook(events.Mac.ApplicationShouldHandleReopen, func(event *application.ApplicationEvent) {
		event.Cancel()
		restoreMainAfterDockClick(api.window, api.settingsWindow)
	})

	win.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		log.Printf("[window] main window closing requested")
		api.mu.Lock()
		quit := api.quitting
		api.mu.Unlock()
		if quit {
			return
		}
		e.Cancel()
		log.Printf("[window] main window close cancelled; hiding to tray")
		api.hideToTray()
	})
	win.OnWindowEvent(events.Common.WindowMinimise, func(_ *application.WindowEvent) {
		if api.store.get().MinimizeToTray {
			api.hideToTray()
		}
	})
	settingsWin.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		e.Cancel()
		settingsWin.Hide()
	})
	settingsWin.OnWindowEvent(events.Common.WindowLostFocus, func(_ *application.WindowEvent) {
		settingsWin.Hide()
	})

	log.Printf("[startup] creating system tray")
	tray := app.SystemTray.New()
	log.Printf("[startup] system tray created")
	applyTrayIcon(tray)
	tray.SetTooltip("MediaBuddy")
	tray.AttachWindow(settingsWin).WindowOffset(6)
	showSettings := func() { tray.ShowWindow() }
	if trayLeftClickShowsSettings(runtime.GOOS) {
		tray.OnClick(showSettings)
	} else {
		tray.OnClick(func() { api.onTrayLeftClick() })
	}
	tray.OnRightClick(showSettings)

	if _, err := api.setAutostart(store.get().Autostart); err != nil {
		log.Printf("sync autostart: %v", err)
	}
	if err := api.sleep.set(store.get().PreventSleep); err != nil {
		log.Printf("enable sleep prevention: %v", err)
	}

	api.scheduleDragOverlay()
	app.Event.OnApplicationEvent(events.Common.ApplicationStarted, func(_ *application.ApplicationEvent) {
		log.Printf("application started; beginning desktop boot")
		go func() {
			defer logStartupPanic("desktop boot")
			api.boot()
			log.Printf("desktop boot completed")
		}()
	})

	log.Printf("[startup] entering Wails application event loop")
	if err := app.Run(); err != nil {
		log.Printf("application event loop exited with error: %v", err)
		return
	}
	log.Printf("[shutdown] Wails application event loop exited without error")
}
