import { request } from "../request";
import { notifySkillsUpdated } from "../../utils/skillsEvents";

export interface PublicResource {
  resource_type:
    | "expert_template"
    | "published_expert"
    | "shared_expert"
    | "builtin_skill"
    | "package_skill"
    | "connector_catalog"
    | "shared_connector";
  resource_id: string;
  category: "experts" | "skills" | "connectors";
  name: string;
  description: string;
  enabled: boolean;
}

export const publicResourcesApi = {
  list: () =>
    request<PublicResource[]>("/admin/public-resources", { cache: "no-store" }),
  async update(
    resourceType: PublicResource["resource_type"],
    ids: string[],
    enabled: boolean,
  ) {
    await request<void>(`/admin/public-resources/${resourceType}`, {
      method: "PUT",
      body: JSON.stringify({ ids, enabled }),
    });
    notifySkillsUpdated();
  },
};
