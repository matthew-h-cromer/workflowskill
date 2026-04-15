import anthropic from "@weldable/integration-anthropic";
import type { Action, Integration } from "@weldable/integration-core";
import discord from "@weldable/integration-discord";
import github from "@weldable/integration-github";
import gmail from "@weldable/integration-gmail";
import googleCalendar from "@weldable/integration-google-calendar";
import googleDocs from "@weldable/integration-google-docs";
import googleDrive from "@weldable/integration-google-drive";
import googleSheets from "@weldable/integration-google-sheets";
import googleTasks from "@weldable/integration-google-tasks";
import slack from "@weldable/integration-slack";
import web from "@weldable/integration-web";
import type { ActionSchema } from "../protocol.js";

const integrations: Integration[] = [
  anthropic,
  discord,
  github,
  gmail,
  googleCalendar,
  googleDocs,
  googleDrive,
  googleSheets,
  googleTasks,
  slack,
  web,
];

const actionsById = new Map<string, Action>();
for (const integ of integrations) {
  for (const action of integ.actions) {
    actionsById.set(action.id, action);
  }
}

export function findAction(actionId: string): Action | undefined {
  return actionsById.get(actionId);
}

export function listActionIds(): string[] {
  return [...actionsById.keys()];
}

/**
 * Convert a compiled Action into a serializable ActionSchema (no execute/mockExecute).
 */
export function toSchema(action: Action): ActionSchema {
  return {
    id: action.id,
    name: action.name,
    description: action.description,
    ...(action.intents !== undefined && { intents: action.intents }),
    ...(action.preview !== undefined && { preview: action.preview }),
    inputFields: action.inputFields.map((f) => ({
      name: f.name,
      type: f.type,
      required: f.required,
      ...(f.description !== undefined && { description: f.description }),
      ...(f.default !== undefined && { default: f.default }),
      ...(f.options !== undefined && { options: f.options }),
    })),
    outputFields: (action.outputFields ?? []).map((f) => ({
      name: f.name,
      type: f.type,
      ...(f.description !== undefined && { description: f.description }),
    })),
  };
}
