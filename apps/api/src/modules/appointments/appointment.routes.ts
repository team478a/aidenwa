import type { FastifyInstance } from 'fastify';
import type { AppointmentRouteDependencies } from './appointment.types.js';
import { registerAppointmentControllers } from './appointment.controller.js';

export function registerStage4ERoutes(app: FastifyInstance, deps: AppointmentRouteDependencies) {
  registerAppointmentControllers(app, deps);
}
