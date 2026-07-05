export type RoleProfile = {
  key: string
  label: string
  actorId: string
  roles: string[]
}

export const roleOptions: RoleProfile[]
export function getActorProfile(key: string): RoleProfile
