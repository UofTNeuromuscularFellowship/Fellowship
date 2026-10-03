import type { Column } from '../components/conference/RecordTable'

// ---------------------------------------------------------------------------
// Sponsors of a course or a rounds series. The level sets the order and how
// large the logo is shown; the optional wording replaces the level's name
// ("Educational grant"). Acknowledged sponsors appear on the attendee pages
// and at the foot of every email for the event (conf_email_html /
// rounds_email_html in the database).
// ---------------------------------------------------------------------------

export type SponsorLevel = 'platinum' | 'gold' | 'silver' | 'bronze' | 'supporter'

export const SPONSOR_LEVELS: { value: SponsorLevel; label: string }[] = [
  { value: 'platinum', label: 'Platinum' },
  { value: 'gold', label: 'Gold' },
  { value: 'silver', label: 'Silver' },
  { value: 'bronze', label: 'Bronze' },
  { value: 'supporter', label: 'Supporter' },
]

/** As the attendee pages receive them (conf_sponsors_json / rounds_sponsors_json). */
export interface PublicSponsor {
  name: string
  kind: 'sponsor' | 'exhibitor'
  level: SponsorLevel
  /** The heading shown: the custom wording, or the level's name. */
  tier: string
  logo_url: string | null
  website: string | null
}

const COMMON_FIRST: Column[] = [
  { key: 'logo_url', label: 'Logo', type: 'logo', hint: 'PNG, JPEG or WebP, up to 2 MB. A wide logo on a white or transparent background works best.' },
  { key: 'name', label: 'Name', required: true },
]
const COMMON_LEVEL: Column[] = [
  { key: 'level', label: 'Level', type: 'select', options: SPONSOR_LEVELS, hint: 'Higher levels are listed first, with larger logos.' },
  { key: 'tier', label: 'Level wording', placeholder: 'Optional, e.g. Educational grant', formOnly: true,
    hint: 'Shown instead of the level’s name. Leave blank to use the level.' },
  { key: 'website', label: 'Website', type: 'url', placeholder: 'https://', formOnly: true, hint: 'The logo links here.' },
]

export const COURSE_SPONSOR_COLUMNS: Column[] = [
  ...COMMON_FIRST,
  { key: 'kind', label: 'Type', type: 'select', options: [{ value: 'sponsor', label: 'Sponsor' }, { value: 'exhibitor', label: 'Exhibitor' }] },
  ...COMMON_LEVEL,
  { key: 'amount', label: 'Pledged', type: 'money' },
  { key: 'table_no', label: 'Table', formOnly: true },
  { key: 'acknowledged', label: 'Shown to attendees', type: 'checkbox',
    hint: 'On the event page, the course materials and the foot of every email about this event.' },
  { key: 'contact_name', label: 'Contact', formOnly: true },
  { key: 'contact_email', label: 'Email', type: 'email', formOnly: true },
  { key: 'contact_phone', label: 'Phone', formOnly: true },
  { key: 'notes', label: 'Notes', type: 'textarea', formOnly: true },
]

export const ROUNDS_SPONSOR_COLUMNS: Column[] = [
  ...COMMON_FIRST,
  ...COMMON_LEVEL,
  { key: 'acknowledged', label: 'Shown to attendees', type: 'checkbox',
    hint: 'On every session’s RSVP page and at the foot of every email for this series.' },
  { key: 'notes', label: 'Notes', type: 'textarea', formOnly: true },
]

/** Logo height on the attendee pages, by level. */
export const LOGO_HEIGHT: Record<SponsorLevel, string> = {
  platinum: 'h-16', gold: 'h-12', silver: 'h-10', bronze: 'h-8', supporter: 'h-7',
}
