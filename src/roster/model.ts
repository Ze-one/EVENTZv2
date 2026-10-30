export const MAX_ROSTER_ROWS = 1000;
export const MAX_ROSTER_BYTES = 10 * 1024 * 1024;
export type RosterParticipant = { fullName: string; phone: string; email: string; organization: string; category: string };
export type RosterField = keyof RosterParticipant | 'firstName' | 'lastName';
export type ColumnMapping = Record<RosterField, number>;
export const rosterFields: { key: RosterField; label: string }[] = [
  { key: 'fullName', label: 'Full name' }, { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' }, { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' }, { key: 'organization', label: 'Organization' },
  { key: 'category', label: 'Category' },
];
export const participantFields = rosterFields.filter(f => !['firstName', 'lastName'].includes(f.key)) as { key: keyof RosterParticipant; label: string }[];
export const fieldLimits: Record<keyof RosterParticipant, number> = { fullName: 200, phone: 80, email: 254, organization: 300, category: 100 };
const words = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const aliases: Record<RosterField, string[]> = {
  fullName: ['full name', 'fullname', 'nom complet', 'nom et prenom', 'noms et prenoms', 'participant name', 'attendee name', 'your name', 'votre nom', 'name'],
  firstName: ['first name', 'firstname', 'given name', 'prenom'],
  lastName: ['last name', 'lastname', 'surname', 'family name', 'nom de famille'],
  phone: ['phone number', 'phone', 'telephone', 'tel', 'mobile', 'contact number', 'numero de telephone'],
  email: ['email address', 'email', 'e mail', 'courriel', 'adresse electronique'],
  organization: ['organization', 'organisation', 'company', 'school', 'entreprise', 'institution', 'ecole'],
  category: ['category', 'categorie', 'ticket type', 'participant type', 'role'],
};
export function detectMapping(headers: string[]): ColumnMapping {
  const mapping = Object.fromEntries(rosterFields.map(f => [f.key, -1])) as ColumnMapping;
  const taken = new Set<number>();
  // Specific fields win over a generic "name" inside a question/header.
  for (const key of ['firstName', 'lastName', 'organization', 'email', 'phone', 'category', 'fullName'] as RosterField[]) {
    const index = headers.findIndex((header, index) => !taken.has(index) && aliases[key].some(alias => ` ${words(header)} `.includes(` ${alias} `)));
    if (index >= 0) { mapping[key] = index; taken.add(index); }
  }
  const nom = headers.findIndex((header, index) => words(header) === 'nom' && !taken.has(index));
  if (nom >= 0) mapping[mapping.firstName >= 0 ? 'lastName' : 'fullName'] = nom;
  return mapping;
}
export const looksLikeHeader = (row: string[]) => Object.values(detectMapping(row)).some(i => i >= 0);
export function mapRoster(rows: string[][], mapping: ColumnMapping, defaultCategory: string): RosterParticipant[] {
  const cell = (row: string[], key: RosterField) => String(row[mapping[key]] ?? '').trim();
  return rows.filter(row => row.some(value => value.trim())).map(row => ({
    fullName: cell(row, 'fullName') || [cell(row, 'firstName'), cell(row, 'lastName')].filter(Boolean).join(' '),
    phone: cell(row, 'phone'), email: cell(row, 'email'), organization: cell(row, 'organization'),
    category: cell(row, 'category') || defaultCategory.trim() || 'Attendees',
  }));
}
export function normalizeParticipant(value: any): RosterParticipant {
  return Object.fromEntries(participantFields.map(({ key }) => [key, typeof value?.[key] === 'string' ? value[key].trim() : ''])) as RosterParticipant;
}
export function participantErrors(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['Participant must be a row of text fields.'];
  const item = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const { key, label } of participantFields) {
    if (item[key] !== undefined && typeof item[key] !== 'string') errors.push(`${label} must be text.`);
    else if (typeof item[key] === 'string' && item[key].trim().length > fieldLimits[key]) errors.push(`${label} must be at most ${fieldLimits[key]} characters.`);
  }
  const normalized = normalizeParticipant(value);
  if (!normalized.fullName) errors.push('Full name is required.');
  if (normalized.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) errors.push('Enter a valid email or leave it blank.');
  return errors;
}
export function duplicateKeys(item: RosterParticipant): string[] {
  const name = item.fullName.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  const phone = item.phone.replace(/\D/g, '');
  const email = item.email.trim().toLowerCase();
  return [email && `email:${email}`, phone && `phone:${name}:${phone}`, !phone && !email && `name:${name}:${item.organization.trim().toLocaleLowerCase()}`].filter(Boolean) as string[];
}
export function partitionDuplicates<T extends RosterParticipant>(rows: T[], existing: RosterParticipant[]) {
  const seen = new Set(existing.flatMap(duplicateKeys));
  const unique: T[] = [], duplicates = new Set<number>();
  rows.forEach((row, index) => {
    const keys = duplicateKeys(row);
    if (keys.some(key => seen.has(key))) duplicates.add(index);
    else { unique.push(row); keys.forEach(key => seen.add(key)); }
  });
  return { unique, duplicates };
}
