export interface User {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  bio: string | null;
  role?: 'USER' | 'ADMIN';
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function createUser(data: {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
  bio?: string | null;
  emailVerified?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}): User {
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    avatar: data.avatar ?? null,
    bio: data.bio ?? null,
    emailVerified: data.emailVerified ?? false,
    createdAt: data.createdAt ?? new Date(),
    updatedAt: data.updatedAt ?? new Date(),
  };
}

