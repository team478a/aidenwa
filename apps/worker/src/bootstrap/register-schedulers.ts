import type { Queue } from 'bullmq';
import { registerMaintenanceSchedulers } from '../maintenance.js';

export async function registerSchedulers(queue: Queue) {
  await registerMaintenanceSchedulers(queue);
}
