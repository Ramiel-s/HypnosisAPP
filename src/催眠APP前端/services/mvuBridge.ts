import _ from 'lodash';
import type { UserResources } from '../types';

const UPDATE_REASON = '催眠APP前端';

function getMessageVariableOption(): VariableOption {
  try {
    return { type: 'message', message_id: getCurrentMessageId() };
  } catch {
    return { type: 'message', message_id: 'latest' };
  }
}

async function getMvuData(): Promise<{ mvu: Mvu.MvuData; option: VariableOption } | null> {
  try {
    await waitGlobalInitialized('Mvu');
    const option = getMessageVariableOption();
    return { mvu: Mvu.getMvuData(option), option };
  } catch (err) {
    console.warn('[HypnoOS] Mvu 未就绪，跳过变量同步', err);
    return null;
  }
}

async function setIfChanged(mvu: Mvu.MvuData, path: string, nextValue: unknown, reason = UPDATE_REASON) {
  const prev = _.get(mvu.stat_data, path);
  if (_.isEqual(prev, nextValue)) return false;

  const setter = (Mvu as any).setMvuVariable as
    | ((mvuData: Mvu.MvuData, variablePath: string, value: unknown, options?: { reason?: string }) => Promise<boolean>)
    | undefined;

  if (typeof setter === 'function') {
    const ok = await setter(mvu, path, nextValue, { reason });
    if (ok) _.set(mvu.stat_data, path, nextValue);
    return ok;
  }

  _.set(mvu.stat_data, path, nextValue);
  return true;
}

export const MvuBridge = {
  getStatData: async (): Promise<Record<string, any> | null> => {
    const data = await getMvuData();
    if (!data) return null;
    return (data.mvu.stat_data ?? null) as any;
  },

  getSystem: async (): Promise<Record<string, any> | null> => {
    const data = await getMvuData();
    if (!data) return null;
    return (_.get(data.mvu, 'stat_data.系统') ?? null) as any;
  },

  getRoles: async (): Promise<Record<string, any> | null> => {
    const data = await getMvuData();
    if (!data) return null;
    const roles = _.get(data.mvu, 'stat_data.角色');
    return _.isPlainObject(roles) ? (roles as any) : null;
  },

  getTasks: async (): Promise<Record<string, any> | null> => {
    const data = await getMvuData();
    if (!data) return null;
    const tasks = _.get(data.mvu, 'stat_data.任务');
    return _.isPlainObject(tasks) ? (tasks as any) : null;
  },

  syncUserResources: async (user: UserResources) => {
    const data = await getMvuData();
    if (!data) return;

    const { mvu, option } = data;
    let changed = false;

    if (await setIfChanged(mvu, '系统._MC能量', user.mcEnergy)) changed = true;
    if (await setIfChanged(mvu, '系统._MC能量上限', user.mcEnergyMax)) changed = true;
    if (await setIfChanged(mvu, '系统.当前MC点', user.mcPoints)) changed = true;
    if (await setIfChanged(mvu, '系统._累计消耗MC点', user.totalConsumedMc)) changed = true;
    if (await setIfChanged(mvu, '系统.持有零花钱', user.money)) changed = true;
    if (await setIfChanged(mvu, '系统.主角可疑度', user.suspicion)) changed = true;

    if (changed) {
      await Mvu.replaceMvuData(mvu, option);
    }
  },

  setTask: async (taskName: string, payload: { 完成条件: string; 已完成: boolean }) => {
    const data = await getMvuData();
    if (!data) return false;
    const { mvu, option } = data;
    const path = `任务.${taskName}`;
    const prev = _.get(mvu.stat_data, path);
    if (_.isEqual(prev, payload)) return false;
    _.set(mvu.stat_data, path, payload);
    await Mvu.replaceMvuData(mvu, option);
    return true;
  },

  deleteTask: async (taskName: string) => {
    const data = await getMvuData();
    if (!data) return false;
    const { mvu, option } = data;

    const path = `任务.${taskName}`;
    const prev = _.get(mvu.stat_data, path);
    if (typeof prev === 'undefined') return false;

    _.unset(mvu.stat_data, path);
    await Mvu.replaceMvuData(mvu, option);
    return true;
  },

  syncPersistedStore: async (store: unknown) => {
    const data = await getMvuData();
    if (!data) return;

    const { mvu, option } = data;
    const changed = await setIfChanged(mvu, '系统._hypnoos', store);
    if (changed) {
      await Mvu.replaceMvuData(mvu, option);
    }
  },

  syncSubscriptionTier: async (tierLabel: string) => {
    if (typeof (globalThis as any).Mvu === 'undefined') return;
    const data = await getMvuData();
    if (!data) return;

    const { mvu, option } = data;
    const changed = await setIfChanged(mvu, '系统._催眠APP订阅等级', tierLabel);
    if (changed) {
      await Mvu.replaceMvuData(mvu, option);
    }
  },
};
