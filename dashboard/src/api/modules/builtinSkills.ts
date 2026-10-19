import { request } from "../request";
import { notifySkillsUpdated } from "../../utils/skillsEvents";

export interface BuiltinSkill {
  slug: string;
  name: string;
  description: string;
  enabled: boolean;
}

export const builtinSkillsApi = {
  list: () => request<BuiltinSkill[]>("/skills/builtin", { cache: "no-store" }),
  async update(slugs: string[], enabled: boolean): Promise<void> {
    await request<void>("/skills/builtin", {
      method: "PUT",
      body: JSON.stringify({ slugs, enabled }),
    });
    notifySkillsUpdated();
  },
};
