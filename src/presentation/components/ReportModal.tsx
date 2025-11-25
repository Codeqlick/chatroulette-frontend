import { useState } from 'react';
import { Button } from './Button';
import { reportService, type ReportCategory } from '@infrastructure/api/report-service';
import { logger } from '@infrastructure/logging/frontend-logger';

interface ReportModalProps {
  sessionId?: string; // Optional: for session-based reports
  username?: string; // Optional: for user-based reports (without session)
  isOpen: boolean;
  onClose: () => void;
  onReportSubmitted: () => void;
}

const REPORT_CATEGORIES: { value: ReportCategory; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'inappropriate_content', label: 'Contenido Inapropiado' },
  { value: 'harassment', label: 'Acoso' },
  { value: 'other', label: 'Otro' },
];

export function ReportModal({
  sessionId,
  username,
  isOpen,
  onClose,
  onReportSubmitted,
}: ReportModalProps): JSX.Element | null {
  const [category, setCategory] = useState<ReportCategory | ''>('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) {
    return null;
  }

  // Validate that either sessionId or username is provided
  if (!sessionId && !username) {
    logger.error('Either sessionId or username must be provided');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);

    if (!category) {
      setError('Por favor selecciona una categoría');
      return;
    }

    setLoading(true);

    try {
      if (sessionId) {
        // Session-based report
        await reportService.createReport({
          sessionId,
          category,
          description: description.trim() || null,
        });
      } else if (username) {
        // User-based report (without session)
        await reportService.createUserReport(username, {
          category,
          description: description.trim() || null,
        });
      }

      onReportSubmitted();
      onClose();
      // Reset form
      setCategory('');
      setDescription('');
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'response' in err &&
        err.response &&
        typeof err.response === 'object' &&
        'data' in err.response &&
        err.response.data &&
        typeof err.response.data === 'object' &&
        'error' in err.response.data &&
        err.response.data.error &&
        typeof err.response.data.error === 'object' &&
        'message' in err.response.data.error
      ) {
        const errorResponse = err.response as {
          data: { error: { message: string } };
        };
        setError(errorResponse.data.error.message);
      } else if (err instanceof Error) {
        setError(err.message || 'Error al enviar el reporte');
      } else {
        setError('Error al enviar el reporte');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <h2 className="text-2xl font-bold text-white mb-4">Reportar Usuario</h2>

        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-500 p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Categoría</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ReportCategory)}
              className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            >
              <option value="">Selecciona una categoría</option>
              {REPORT_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Descripción (opcional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={500}
              className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              placeholder="Describe el problema..."
            />
            <p className="text-xs text-gray-400 mt-1">{description.length}/500 caracteres</p>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 bg-gray-700 hover:bg-gray-600"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} isLoading={loading} className="flex-1">
              Reportar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
