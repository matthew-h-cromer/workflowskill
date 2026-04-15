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
import type { ActionInfo } from "../protocol.js";

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
 * Strip runtime handlers from a compiled Action, returning a serializable ActionInfo.
 */
export function toActionInfo({ execute: _e, mockExecute: _m, ...rest }: Action): ActionInfo {
  return {
    ...rest,
    inputFields: rest.inputFields.map((f) => ({ ...f })),
    outputFields: (rest.outputFields ?? []).map((f) => ({ ...f })),
  };
}
