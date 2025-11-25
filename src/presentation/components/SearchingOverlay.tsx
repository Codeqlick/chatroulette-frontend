import { Button } from './Button';

interface SearchingOverlayProps {
  isSearching: boolean;
  onCancel?: () => void;
  showCancelButton?: boolean;
}

export function SearchingOverlay({ isSearching, onCancel, showCancelButton = true }: SearchingOverlayProps): JSX.Element | null {
  if (!isSearching) {
    return null;
  }

  return (
    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center z-10 transition-opacity duration-300">
      <div className="text-center space-y-6">
        {/* Spinner */}
        <div className="relative">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-white/30 border-t-white mx-auto"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 bg-white/20 rounded-full animate-pulse"></div>
          </div>
        </div>

        {/* Text */}
        <div className="space-y-2">
          <h2 className="text-2xl md:text-3xl font-bold text-white">
            Buscando compañero...
          </h2>
          <p className="text-white/80 text-sm md:text-base">
            Estamos buscando alguien con quien puedas chatear
          </p>
        </div>

        {/* Cancel Button */}
        {showCancelButton && onCancel && (
          <div className="pt-4">
            <Button
              variant="secondary"
              size="md"
              onClick={onCancel}
              className="bg-white/20 hover:bg-white/30 text-white border-white/30"
            >
              Cancelar búsqueda
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

