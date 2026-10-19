import { useEffect, useState } from "react";
import { Alert, Button, Drawer, Form, Input, Select, Space } from "antd";
import { useTranslation } from "react-i18next";
import type { OctopAgent } from "../../context/AgentContext";
import {
  assistantsApi,
  type AssistantFormValues,
  type AssistantTemplate,
} from "../../api/modules/assistants";
import { providerApi } from "../../api/modules/provider";
import {
  knowledgeBasesApi,
  type KnowledgeBase,
} from "../../api/modules/knowledgeBases";
import {
  buildModelSelectOptions,
  type ModelPickerOption,
} from "../../utils/modelOptions";
import { apiErrorMessage } from "../../utils/apiError";
import { pickLocale } from "../../utils/localizedText";
import { userCan } from "../../utils/permissions";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import styles from "./index.module.less";

interface Props {
  open: boolean;
  agent: OctopAgent | null;
  onClose: () => void;
  onSaved: (agentId: string) => Promise<void>;
}

export default function AssistantForm({
  open,
  agent,
  onClose,
  onSaved,
}: Props) {
  const { t, i18n } = useTranslation();
  const user = useCurrentUser();
  const [form] = Form.useForm<AssistantFormValues>();
  const [models, setModels] = useState<ModelPickerOption[]>([]);
  const [templates, setTemplates] = useState<AssistantTemplate[]>([]);
  const [bases, setBases] = useState<KnowledgeBase[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lang = i18n.language.startsWith("zh") ? "zh" : "en";

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: agent?.name ?? "",
      role: agent?.description ?? "",
      description: agent?.system_prompt || agent?.description || "",
      default_model: agent?.default_model ?? "",
      template_name: agent?.template_name || "general-assistant",
      knowledge_base_ids: agent?.knowledge_base_ids ?? [],
    });
    setError(null);
    let cancelled = false;
    void Promise.allSettled([
      providerApi.listResolvedModels(),
      assistantsApi.templates(),
      userCan(user, "knowledge_bases")
        ? knowledgeBasesApi.list()
        : Promise.resolve([]),
    ]).then(([modelResult, templateResult, baseResult]) => {
      if (cancelled) return;
      setModels(
        modelResult.status === "fulfilled"
          ? (modelResult.value as ModelPickerOption[])
          : [],
      );
      setTemplates(
        templateResult.status === "fulfilled" ? templateResult.value : [],
      );
      setBases(baseResult.status === "fulfilled" ? baseResult.value : []);
      if (
        modelResult.status === "rejected" ||
        templateResult.status === "rejected" ||
        baseResult.status === "rejected"
      ) {
        setError(t("assistants.resourcesFailed"));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, agent, form, t, user]);

  const save = async (values: AssistantFormValues) => {
    setSaving(true);
    setError(null);
    try {
      const saved = agent
        ? await assistantsApi.update(agent, values)
        : await assistantsApi.create(values);
      await onSaved(saved.agent_id);
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, t("assistants.saveFailed"), t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      width={640}
      title={t(agent ? "assistants.edit" : "assistants.create")}
      onClose={saving ? undefined : onClose}
      className={styles.formDrawer}
      destroyOnClose
      footer={
        <Space>
          <Button onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button type="primary" loading={saving} onClick={() => form.submit()}>
            {t(agent ? "common.save" : "assistants.create")}
          </Button>
        </Space>
      }
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => void save(values)}
        disabled={saving}
        requiredMark={false}
      >
        {error && (
          <Alert
            type="error"
            showIcon
            message={error}
            className={styles.formError}
          />
        )}
        <h3>{t("assistants.basicInfo")}</h3>
        <Form.Item
          name="role"
          label={t("assistants.role")}
          rules={[
            {
              required: true,
              whitespace: true,
              message: t("assistants.required"),
            },
          ]}
        >
          <Input
            placeholder={t("assistants.rolePlaceholder")}
            maxLength={100}
          />
        </Form.Item>
        <Form.Item
          name="description"
          label={t("assistants.responsibilities")}
          rules={[
            {
              required: true,
              whitespace: true,
              message: t("assistants.required"),
            },
          ]}
        >
          <Input.TextArea
            rows={5}
            placeholder={t("assistants.responsibilitiesPlaceholder")}
            maxLength={2000}
            showCount
          />
        </Form.Item>
        <Form.Item
          name="name"
          label={t("assistants.name")}
          rules={[
            {
              required: true,
              whitespace: true,
              message: t("assistants.required"),
            },
          ]}
        >
          <Input
            placeholder={t("assistants.namePlaceholder")}
            maxLength={100}
          />
        </Form.Item>
        <h3>{t("assistants.taskConfiguration")}</h3>
        <Form.Item name="default_model" label={t("assistants.model")}>
          <Select
            options={buildModelSelectOptions(models, t("assistants.autoModel"))}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>
        <Form.Item
          name="template_name"
          label={t("assistants.hiredExpert")}
          extra={t(
            agent
              ? "assistants.templateExistingHint"
              : "assistants.templateHint",
          )}
        >
          <Select
            disabled={Boolean(agent)}
            showSearch
            optionFilterProp="label"
            options={
              templates.length
                ? templates.map((template) => ({
                    value: template.id,
                    label: pickLocale(template.label, lang) || template.id,
                  }))
                : [
                    {
                      value: agent?.template_name || "general-assistant",
                      label:
                        agent?.template_name ||
                        t("assistants.generalAssistant"),
                    },
                  ]
            }
          />
        </Form.Item>
        {userCan(user, "knowledge_bases") && (
          <Form.Item
            name="knowledge_base_ids"
            label={t("assistants.referenceMaterials")}
          >
            <Select
              mode="multiple"
              allowClear
              placeholder={t("assistants.selectMaterials")}
              options={bases.map((base) => ({
                value: base.id,
                label: base.name,
              }))}
            />
          </Form.Item>
        )}
        <p className={styles.formHint}>{t("assistants.configurationHint")}</p>
      </Form>
    </Drawer>
  );
}
