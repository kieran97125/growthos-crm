export type MfaResult = {
  error?: string;
  sent?: boolean;
  factor?: string;
  qr?: string;
  secret?: string;
};
