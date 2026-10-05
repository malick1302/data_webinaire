import { timingSafeEqual } from "crypto";
import { trainerKey } from "@/lib/env";
import { HttpError } from "@/lib/http";

export function trainerKeyRequired(): boolean {
  return trainerKey().length > 0;
}

export function assertTrainer(request: Request): void {
  const expected = trainerKey();
  if (!expected) return;

  const provided = request.headers.get("x-trainer-key") ?? "";
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new HttpError(401, "Clé formateur refusée");
  }
}
