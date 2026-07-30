import type { FastifyInstance } from 'fastify';
import { createAppointmentControllerContext } from './appointment-controller.context.js';
import { registerAppointmentOperationControllers } from './appointment-operations.controller.js';
import { registerAppointmentSettingsControllers } from './appointment-settings.controller.js';
import type { AppointmentRouteDependencies } from './appointment.types.js';

export function registerAppointmentControllers(
  app: FastifyInstance,
  deps: AppointmentRouteDependencies,
) {
  const context = createAppointmentControllerContext(deps);
  registerAppointmentSettingsControllers(app, context);
  registerAppointmentOperationControllers(app, context);
}
