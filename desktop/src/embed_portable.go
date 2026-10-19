//go:build !production || darwin

package main

// Development builds look for MediaBuddy-<plat>.zip or MediaBuddy-portable-<plat>-*.zip
// beside the executable. macOS production copies the zip into Resources as
// MediaBuddy-<plat>.zip.
var embeddedPortable []byte
