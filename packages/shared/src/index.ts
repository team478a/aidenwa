export const APP_NAME = 'Sales AI OS' as const;
export const DEFAULT_TIME_ZONE = 'Asia/Tokyo' as const;

export type HealthStatus = { service: 'web' | 'api' | 'worker'; status: 'ok'; timestamp: string };
export { inCallableWindow } from './callable-window';
