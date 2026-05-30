/**
 * ArgonarPay Payment Utility
 * Standardizes payment link generation and sharing for the Lender platform.
 */

export const ARGONAR_PAY_BASE_URL = "https://pay.argonar.com/link";

/**
 * Generates a standardized payment link for ArgonarPay
 */
export function generateArgonarPayLink(data: { amount: number; debtId: string }): string {
  const params = new URLSearchParams({
    amount: data.amount.toString(),
    ref: data.debtId,
    currency: "PHP",
    merchant: "MUTANG"
  });
  
  return `${ARGONAR_PAY_BASE_URL}?${params.toString()}`;
}

/**
 * Utility to share the payment link via Web Share API or copy to clipboard
 */
export async function sharePaymentLink(data: {
  link: string;
  title: string;
  message: string;
}): Promise<{ success: boolean; method: 'share' | 'clipboard' | 'failed' }> {
  const { link, title, message } = data;

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title,
        text: message,
        url: link,
      });
      return { success: true, method: 'share' };
    } catch (error) {
      console.error('Error sharing:', error);
    }
  }

  // Fallback: Copy to clipboard
  try {
    await navigator.clipboard.writeText(message);
    return { success: true, method: 'clipboard' };
  } catch (error) {
    console.error('Clipboard error:', error);
    return { success: false, method: 'failed' };
  }
}
