import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useBanStore } from '@application/stores/ban-store';
import { useAuthStore } from '@application/stores/auth-store';
import { paymentService } from '@infrastructure/api/payment-service';
import { Button } from '../components/Button';
import { ThemeToggle } from '../components/ThemeToggle';

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

interface PaymentFormProps {
  paymentIntentId: string;
  amount: number;
  currency: string;
  onSuccess: () => void;
  onError: (message: string) => void;
}

function UnbanPaymentForm({
  paymentIntentId,
  amount,
  currency,
  onSuccess,
  onError,
}: PaymentFormProps): JSX.Element {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!stripe || !elements) {
      onError('Stripe no está listo. Intenta nuevamente en unos segundos.');
      return;
    }

    try {
      setIsSubmitting(true);
      setMessage(null);
      const result = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      });

      if (result.error) {
        const errorMessage =
          result.error.message ?? 'No pudimos procesar el pago. Intenta nuevamente.';
        setMessage(errorMessage);
        onError(errorMessage);
        return;
      }

      if (result.paymentIntent?.status === 'succeeded') {
        await paymentService.confirmUnbanPayment(paymentIntentId);
        onSuccess();
        setMessage('Pago confirmado.');
      } else {
        const fallbackMessage = `El estado del pago es ${result.paymentIntent?.status ?? 'desconocido'}.`;
        setMessage(fallbackMessage);
        onError(fallbackMessage);
      }
    } catch (error) {
      const fallbackMessage =
        error instanceof Error ? error.message : 'Error inesperado al confirmar el pago.';
      setMessage(fallbackMessage);
      onError(fallbackMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Monto a pagar:{' '}
        <span className="font-semibold text-gray-900 dark:text-white">{amount.toFixed(2)}</span>{' '}
        {currency.toUpperCase()}
      </p>
      <PaymentElement />
      {message && <p className="text-sm text-red-500">{message}</p>}
      <Button
        type="submit"
        disabled={isSubmitting || !stripe || !elements}
        isLoading={isSubmitting}
        className="w-full"
      >
        Confirmar pago
      </Button>
    </form>
  );
}

export function BannedPage(): JSX.Element {
  const { isBanned, details, email } = useBanStore();
  const { isAuthenticated } = useAuthStore();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isRequestingPayment, setIsRequestingPayment] = useState(false);
  const [paymentData, setPaymentData] = useState<{
    clientSecret: string;
    paymentIntentId: string;
    amount: number;
    currency: string;
  } | null>(null);

  const handleRequestPayment = async (): Promise<void> => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!isAuthenticated) {
      setErrorMessage('Necesitas mantener tu sesión activa para gestionar el pago del desbaneo.');
      return;
    }

    if (!stripePublishableKey) {
      setErrorMessage('Stripe no está configurado en el frontend. Contacta al equipo de soporte.');
      return;
    }

    try {
      setIsRequestingPayment(true);
      const response = await paymentService.createUnbanPayment();
      setPaymentData({
        clientSecret: response.clientSecret,
        paymentIntentId: response.paymentIntentId,
        amount: response.amount,
        currency: response.currency,
      });
    } catch (error) {
      const fallbackMessage =
        error instanceof Error
          ? error.message
          : 'No se pudo iniciar el proceso de pago. Intenta nuevamente.';
      setErrorMessage(fallbackMessage);
    } finally {
      setIsRequestingPayment(false);
    }
  };

  const handlePaymentSuccess = (): void => {
    setSuccessMessage('Pago completado con éxito. Tu cuenta será restablecida en breve.');
    useBanStore.getState().clearBanInfo();
    setPaymentData(null);
  };

  if (!isBanned) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white dark:bg-gray-800 rounded-xl shadow-xl p-8 text-center space-y-4">
          <p className="text-lg font-semibold">Tu cuenta no está baneada.</p>
          <Button onClick={() => (window.location.href = '/login')}>
            Volver al inicio de sesión
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors px-4 py-10">
      <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 space-y-8">
        <div className="flex justify-between items-start gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold">Tu cuenta ha sido suspendida</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-2">
              Motivo:{' '}
              <span className="font-semibold text-gray-900 dark:text-white">
                {details?.reason ?? 'Sin especificar'}
              </span>
            </p>
            {details?.bannedUntil && (
              <p className="text-gray-500 dark:text-gray-400">
                Vigente hasta:{' '}
                <span className="font-semibold text-gray-900 dark:text-white">
                  {new Date(details.bannedUntil).toLocaleString()}
                </span>
              </p>
            )}
          </div>
          <ThemeToggle />
        </div>

        {!isAuthenticated && (
          <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-200 rounded-lg p-4">
            <p className="font-semibold">Inicia sesión para continuar</p>
            <p className="text-sm mt-1">
              Necesitamos mantener tu sesión activa para generar el pago. Si el error persiste,
              contáctanos en{' '}
              <a href="mailto:soporte@codeqlick.com" className="underline">
                soporte@codeqlick.com
              </a>
              .
            </p>
          </div>
        )}

        {errorMessage && <p className="text-red-500">{errorMessage}</p>}
        {successMessage && <p className="text-green-500">{successMessage}</p>}

        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-6 space-y-4">
          <h2 className="text-xl font-semibold">Recupera tu cuenta</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Para volver a utilizar la plataforma debes completar el pago de desbaneo. El proceso es
            completamente seguro y se realiza a través de Stripe.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={handleRequestPayment}
              isLoading={isRequestingPayment}
              disabled={!isAuthenticated}
            >
              {paymentData ? 'Volver a cargar formulario de pago' : 'Iniciar pago de desbaneo'}
            </Button>
            {email && (
              <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center">
                Cuenta asociada:{' '}
                <span className="ml-1 font-semibold text-gray-900 dark:text-white">{email}</span>
              </span>
            )}
          </div>
        </div>

        {stripePromise && paymentData?.clientSecret ? (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret: paymentData.clientSecret,
              appearance: { theme: 'stripe' },
            }}
          >
            <div className="bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4">Completa el pago</h3>
              <UnbanPaymentForm
                paymentIntentId={paymentData.paymentIntentId}
                amount={paymentData.amount}
                currency={paymentData.currency}
                onSuccess={handlePaymentSuccess}
                onError={(message) => setErrorMessage(message)}
              />
            </div>
          </Elements>
        ) : (
          paymentData &&
          !stripePromise && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-6">
              <p className="text-red-700 dark:text-red-200">
                No podemos mostrar el formulario de pago porque falta la llave pública de Stripe
                (VITE_STRIPE_PUBLISHABLE_KEY). Contacta al equipo técnico para completar el proceso.
              </p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
