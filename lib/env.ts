export function googleClientId(): string {
  return (
    process.env.GOOGLE_CLIENT_ID ||
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    ""
  );
}

export function devIdentityEnabled(): boolean {
  return process.env.POC_ALLOW_DEV_IDENTITY === "true";
}

export function trainerKey(): string {
  return process.env.TRAINER_KEY ?? "";
}

export function cloudProjectNumber(): string {
  return process.env.NEXT_PUBLIC_CLOUD_PROJECT_NUMBER ?? "";
}
