import React, { useState, useRef } from 'react';
import { userService } from '@infrastructure/api/user-service';
import { useAuthStore } from '@application/stores/auth-store';
import { Button } from './Button';

interface AvatarUploadProps {
  currentAvatar?: string | null;
  onUploadComplete?: (avatarUrl: string) => void;
}

export function AvatarUpload({ currentAvatar, onUploadComplete }: AvatarUploadProps): JSX.Element {
  const [preview, setPreview] = useState<string | null>(currentAvatar || null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const user = useAuthStore((state) => state.user);
  const setAuth = useAuthStore((state) => state.setAuth);

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Tipo de archivo no válido. Solo se permiten imágenes JPEG, PNG o WebP.';
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'El archivo es demasiado grande. El tamaño máximo es 5MB.';
    }
    return null;
  };

  const handleFileSelect = (file: File): void => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload file
    handleUpload(file);
  };

  const handleUpload = async (file: File): Promise<void> => {
    setIsUploading(true);
    setError(null);

    try {
      const result = await userService.uploadAvatar(file);

      // Update auth store with new avatar
      if (user) {
        setAuth({
          accessToken: useAuthStore.getState().accessToken || '',
          refreshToken: useAuthStore.getState().refreshToken || '',
          user: {
            username: user.username,
            email: user.email,
            name: user.name,
            avatar: result.avatarUrl,
            role: user.role || 'USER', // Ensure role is always present
          },
        });
      }

      if (onUploadComplete) {
        onUploadComplete(result.avatarUrl);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Error al subir el avatar. Intenta nuevamente.';
      setError(errorMessage);
      setPreview(currentAvatar || null); // Revert preview on error
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (): void => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleClick = (): void => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-4">
      <div
        className={`relative w-32 h-32 mx-auto rounded-full overflow-hidden border-2 border-dashed transition-colors ${
          isDragging ? 'border-primary-500 bg-primary-500/20' : 'border-gray-600 bg-gray-800'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {preview ? (
          <img src={preview} alt="Avatar preview" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-12 w-12"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </div>
        )}
        {isUploading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        onChange={handleFileInputChange}
        className="hidden"
      />

      <div className="text-center space-y-2">
        <Button
          onClick={handleClick}
          disabled={isUploading}
          isLoading={isUploading}
          variant="secondary"
          size="sm"
          className="w-full"
        >
          {preview ? 'Cambiar avatar' : 'Seleccionar avatar'}
        </Button>
        <p className="text-xs text-gray-400">
          Arrastra una imagen aquí o haz clic para seleccionar
        </p>
        <p className="text-xs text-gray-500">JPEG, PNG o WebP (máx. 5MB)</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500 text-red-500 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
