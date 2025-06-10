export interface ImgurImage {
  id: string;
  title: string | null;
  description: string | null;
  datetime: number;
  type: string;
  animated: boolean;
  width: number;
  height: number;
  size: number;
  views: number;
  bandwidth: number;
  vote: string | null;
  favorite: boolean;
  nsfw: boolean | null;
  section: string | null;
  account_url: string | null;
  account_id: number | null;
  is_ad: boolean;
  in_most_viral: boolean;
  has_sound: boolean;
  tags: any[];
  ad_type: number;
  ad_url: string;
  edited: string;
  in_gallery: boolean;
  deletehash: string;
  name: string;
  link: string;
}

export interface ImgurAlbum {
  id: string;
  title: string | null;
  description: string | null;
  datetime: number;
  cover: string;
  cover_width: number;
  cover_height: number;
  account_url: string | null;
  account_id: number | null;
  privacy: string;
  layout: string;
  views: number;
  link: string;
  favorite: boolean;
  nsfw: boolean;
  section: string | null;
  images_count: number;
  in_gallery: boolean;
  is_ad: boolean;
  images: ImgurImage[];
}

export interface ImgurApiResponse<T> {
  data: T;
  success: boolean;
  status: number;
}

export interface ImgurAuthToken {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  refresh_token: string;
  account_id: number;
  account_username: string;
}
