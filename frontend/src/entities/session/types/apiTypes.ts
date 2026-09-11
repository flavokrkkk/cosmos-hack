export type LoginDto = {
  username: string
  password: string
}

export type LoginResponse = {
  access_token: string
  refresh_token: string
  token_type: string
}

export type CurrentUserResponse = {
  id: string
  username: string
  is_active: boolean
}
