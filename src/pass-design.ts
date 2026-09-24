export type PassTemplateId =
  | 'eventz-classic'
  | 'industrial-badge'
  | 'premium-ticket'
  | 'volunteer-card'
  | 'uploaded';

export type PassOrientation = 'portrait' | 'landscape';
export type QrPlacement = 'bottom-center' | 'bottom-right' | 'right-center' | 'left-bottom';

export const DEFAULT_PASS_DESIGN = {
  type: 'eventz-pass-design',
  designType: 'ticket',
  templateId: 'eventz-classic' as PassTemplateId,
  orientation: 'portrait' as PassOrientation,
  backgroundColor: '#d8dcdf',
  topBarColor: '#d8dcdf',
  brandPanelColor: '#ffffff',
  textColor: '#020617',
  mutedTextColor: '#475569',
  logoBlockColor: '#0b1f4d',
  qrFrameColor: '#ffffff',
  primaryColor: '#0b1f4d',
  accentColor: '#f2a900',
  logoText: 'eventZ',
  slogan: 'manage your event access by ETS.NTECH',
  icon: 'ticket',
  customLogoDataUrl: '',
  logoFit: 'contain',
  customTemplateDataUrl: '',
  templateFit: 'cover',
  templateOverlayOpacity: 18,
  qrPlacement: 'bottom-center' as QrPlacement,
  cornerRadius: 32,
  qrSize: 208,
  showTopNotch: true,
  showBrandPanel: true,
  showEventName: true,
  showParticipantName: true,
  showPassId: true,
  showVenue: true,
  showDate: true,
  fontStyle: 'modern'
};

export type PassDesign = typeof DEFAULT_PASS_DESIGN;

export const PASS_TEMPLATES: Array<{
  id: PassTemplateId;
  name: string;
  subtitle: string;
  orientation: PassOrientation;
  previewClass: string;
  patch: Partial<PassDesign>;
}> = [
  {
    id: 'eventz-classic',
    name: 'EVENTZ Classic',
    subtitle: 'Clean credential with central EVENTZ branding',
    orientation: 'portrait',
    previewClass: 'bg-gradient-to-b from-slate-200 via-white to-slate-200',
    patch: {
      orientation: 'portrait',
      backgroundColor: '#d8dcdf',
      topBarColor: '#d8dcdf',
      brandPanelColor: '#ffffff',
      primaryColor: '#0b1f4d',
      accentColor: '#f2a900',
      textColor: '#020617',
      mutedTextColor: '#475569',
      qrFrameColor: '#ffffff',
      qrPlacement: 'bottom-center',
      showBrandPanel: true,
      showTopNotch: true
    }
  },
  {
    id: 'industrial-badge',
    name: 'Industrial Badge',
    subtitle: 'Portrait navy badge with a clean information footer',
    orientation: 'portrait',
    previewClass: 'bg-gradient-to-b from-[#10214e] via-[#10214e] to-white',
    patch: {
      orientation: 'portrait',
      backgroundColor: '#ffffff',
      topBarColor: '#10214e',
      brandPanelColor: '#10214e',
      primaryColor: '#10214e',
      accentColor: '#f2a900',
      textColor: '#0f172a',
      mutedTextColor: '#64748b',
      qrFrameColor: '#ffffff',
      qrPlacement: 'bottom-right',
      showBrandPanel: false,
      showTopNotch: true,
      cornerRadius: 20
    }
  },
  {
    id: 'premium-ticket',
    name: 'Premium Ticket',
    subtitle: 'Horizontal dark ticket with a strong QR security zone',
    orientation: 'landscape',
    previewClass: 'bg-gradient-to-r from-[#17191f] via-[#22252d] to-[#101216]',
    patch: {
      orientation: 'landscape',
      backgroundColor: '#181a20',
      topBarColor: '#181a20',
      brandPanelColor: '#181a20',
      primaryColor: '#111318',
      accentColor: '#2ed6a1',
      textColor: '#ffffff',
      mutedTextColor: '#9ca3af',
      logoBlockColor: '#111318',
      qrFrameColor: '#ffffff',
      qrPlacement: 'right-center',
      showBrandPanel: false,
      showTopNotch: true,
      cornerRadius: 18
    }
  },
  {
    id: 'volunteer-card',
    name: 'Volunteer Card',
    subtitle: 'Portrait identity card with geometric event styling',
    orientation: 'portrait',
    previewClass: 'bg-gradient-to-br from-[#111b5a] via-[#29bad5] to-white',
    patch: {
      orientation: 'portrait',
      backgroundColor: '#ffffff',
      topBarColor: '#111b5a',
      brandPanelColor: '#25b8d3',
      primaryColor: '#111b5a',
      accentColor: '#25b8d3',
      textColor: '#0f172a',
      mutedTextColor: '#64748b',
      qrFrameColor: '#ffffff',
      qrPlacement: 'bottom-center',
      showBrandPanel: false,
      showTopNotch: false,
      cornerRadius: 10
    }
  }
];

export function getPassDesign(event: any): PassDesign {
  try {
    const parsed = JSON.parse(event?.logoPath || '{}');
    if (parsed?.type === 'eventz-pass-design') {
      return {
        ...DEFAULT_PASS_DESIGN,
        ...parsed,
        customLogoDataUrl: parsed.customLogoDataUrl || '',
        customTemplateDataUrl: parsed.customTemplateDataUrl || ''
      };
    }
  } catch {}

  return {
    ...DEFAULT_PASS_DESIGN,
    primaryColor: event?.primaryColor || DEFAULT_PASS_DESIGN.primaryColor,
    accentColor: event?.accentColor || DEFAULT_PASS_DESIGN.accentColor,
    logoBlockColor: event?.primaryColor || DEFAULT_PASS_DESIGN.logoBlockColor
  };
}

export function applyPassTemplate(current: PassDesign, templateId: PassTemplateId): PassDesign {
  const template = PASS_TEMPLATES.find((item) => item.id === templateId);
  if (!template) return { ...current, templateId };
  return {
    ...current,
    ...template.patch,
    templateId,
    customTemplateDataUrl: templateId === 'uploaded' ? current.customTemplateDataUrl : ''
  };
}
