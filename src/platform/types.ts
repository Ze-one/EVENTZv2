import type { EventDetails, Participant, User } from "../types.js";

export type Account = Omit<User, "passwordHash">;
export type Organizer = {
  id: string;
  name: string;
  bio: string;
  profileImage: string;
  followerCount: number;
};
export type PublicEvent = Pick<
  EventDetails,
  | "id"
  | "eventName"
  | "eventDate"
  | "eventTime"
  | "venue"
  | "description"
  | "organizerName"
  | "category"
  | "city"
  | "coverImage"
  | "locationType"
  | "timezone"
  | "publicationStatus"
  | "eventCapacity"
  | "registrationEnabled"
  | "registrationDeadline"
  | "createdAt"
> & {
  organizer: Organizer;
  attendeeCount: number;
  availableSpots: number | null;
};
export type WorkspaceEvent = PublicEvent & {
  accessRole: "admin" | "gate_officer";
};
export type Registration = {
  participant: Participant;
  event: PublicEvent;
  verifyUrl: string;
};
