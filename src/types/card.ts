export interface RiftCardAttributes {
  energy: number | null;
  might: number | null;
  power: number | null;
}

export interface RiftCardClassification {
  type: string | null;
  supertype: string | null;
  rarity: string | null;
  domain: string[];
}

export interface RiftCardText {
  plain: string;
  rich?: string;
}

export interface RiftCardSetInfo {
  id: string;
  label: string;
}

export interface RiftCardMedia {
  image_url: string;
  artist?: string | null;
  accessibility_text?: string | null;
}

export interface RiftCardMetadata {
  alternate_art: boolean;
  overnumbered: boolean;
  signature: boolean;
}

export interface RiftCard {
  id: string;
  name: string;
  riftbound_id: string;
  tcgplayer_id?: string | null;
  public_code: string;
  collector_number: number;
  attributes: RiftCardAttributes;
  classification: RiftCardClassification;
  text: RiftCardText;
  set: RiftCardSetInfo;
  media: RiftCardMedia;
  tags: string[];
  orientation: string;
  metadata: RiftCardMetadata;
}

export interface RiftCardListResponse {
  items: RiftCard[];
  total: number;
  page: number;
  size: number;
  pages: number;
}
