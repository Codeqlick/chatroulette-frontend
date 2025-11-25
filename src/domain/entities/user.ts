export interface User {
  username: string;
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
  username: string;
  email: string;
  name: string;
  avatar?: string | null;
  bio?: string | null;
  emailVerified?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}): User {
  return {
    username: data.username,
    email: data.email,
    name: data.name,
    avatar: data.avatar ?? null,
    bio: data.bio ?? null,
    emailVerified: data.emailVerified ?? false,
    createdAt: data.createdAt ?? new Date(),
    updatedAt: data.updatedAt ?? new Date(),
  };
}

