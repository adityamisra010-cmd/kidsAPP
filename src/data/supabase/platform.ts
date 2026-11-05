/** Platform admin: schools (counts only, via platform_school_summaries) and global templates. */
import type { PlatformRepo } from '../repository';
import type { AdapterContext } from './context';
import { dimensionFromRow, goalBankFromRow, resourceFromRow } from './mappers';
import { inviteFromJson, organizationFromJson, schoolSummaryFromJson } from './mappers-rpc';
import { many, rpc, single } from './query';
import type { CreateSchoolResult, GoalBankRow, RatingDimensionRow, ResourceRow, SchoolSummaryJson } from './rows';

export function createPlatformRepo(c: AdapterContext): PlatformRepo {
  const sb = c.sb;
  return {
    async listSchools() {
      const rows = await rpc<SchoolSummaryJson[] | null>(sb, 'platform_school_summaries');
      return (rows ?? []).map(schoolSummaryFromJson);
    },

    async createSchool(input) {
      const r = await rpc<CreateSchoolResult>(sb, 'create_school', {
        name: input.name,
        short_name: input.shortName,
        city: input.city,
        address: input.address,
        phone: input.phone,
        admin_name: input.adminName,
        admin_phone: input.adminPhone,
      });
      return { organization: organizationFromJson(r.organization), invite: inviteFromJson(r.invite) };
    },

    async setSchoolStatus(orgId, status) {
      await single(sb.from('organizations').update({ status }).eq('id', orgId).select('id'), 'school');
    },

    async listGlobalDimensions() {
      const rows = await many<RatingDimensionRow>(sb.from('rating_dimensions').select('*').is('organization_id', null).order('sort_order'));
      return rows.map(dimensionFromRow);
    },

    async listGlobalGoalBank() {
      const rows = await many<GoalBankRow>(sb.from('goal_bank').select('*').is('organization_id', null).order('domain').order('staff_text'));
      return rows.map(goalBankFromRow);
    },

    async upsertGlobalGoalBankItem(input) {
      const values = {
        organization_id: null,
        domain: input.domain,
        therapy_type_key: input.therapyTypeKey,
        staff_text: input.staffText.trim(),
        parent_text: input.parentText.trim(),
      };
      const q = input.id ? sb.from('goal_bank').update(values).eq('id', input.id).is('organization_id', null) : sb.from('goal_bank').insert(values);
      return goalBankFromRow(await single<GoalBankRow>(q.select('*'), 'goal bank item'));
    },

    async listGlobalResources() {
      const rows = await many<ResourceRow>(sb.from('resources').select('*').is('organization_id', null).order('title'));
      return rows.map((r) => resourceFromRow(r));
    },
  };
}
