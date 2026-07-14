export type CrmWriteMode = {
  enabled: boolean;
  actionsEnabled: boolean;
  label: string;
  disabledReason: string | null;
};

export function getCrmWriteMode(): CrmWriteMode {
  const enabled = process.env.CRM_WRITE_ENABLED?.trim().toLowerCase() === "true";

  return {
    enabled,
    actionsEnabled: false,
    label: enabled ? "CRM write flag enabled" : "CRM writes disabled",
    disabledReason: "CRM write actions are not enabled yet.",
  };
}
