import React from 'react';

/**
 * Componente UI Padronizado de Botão de Login com Google
 *
 * @param {Object} props
 * @param {Function} props.onClick Função chamada ao clicar (ex: a função `login` do `useGoogleAuth`)
 * @param {boolean} [props.isLoading=false] Estado de carregamento (exibe spinner)
 * @param {boolean} [props.disabled=false] Desabilita o botão
 * @param {string} [props.label="Continuar com o Google"] Texto do botão
 * @param {string} [props.variant="dark"] Variante de estilo: 'dark' | 'light' | 'glass'
 * @param {string} [props.className=""] Classes adicionais do Tailwind
 */
export function GoogleLoginButton({
  onClick,
  isLoading = false,
  disabled = false,
  label = 'Continuar com o Google',
  variant = 'dark',
  className = '',
  ...rest
}) {
  // Estilos por variante
  const variantStyles = {
    dark: 'bg-slate-900 hover:bg-slate-800 text-slate-100 border-slate-700/80 hover:border-slate-600 shadow-lg shadow-slate-950/40',
    light: 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300 shadow-sm',
    glass: 'bg-slate-900/60 hover:bg-slate-800/80 text-slate-100 border-slate-700/60 backdrop-blur-md shadow-md'
  };

  const selectedVariant = variantStyles[variant] || variantStyles.dark;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      className={`relative group flex items-center justify-center gap-3 w-full py-3.5 px-6 rounded-2xl font-semibold transition-all duration-300 border focus:outline-none focus:ring-2 focus:ring-sky-500/50 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer ${selectedVariant} ${className}`}
      {...rest}
    >
      {isLoading ? (
        <svg
          className="animate-spin h-5 w-5 text-sky-400"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      ) : (
        /* Logo Oficial do Google (SVG de 4 cores) */
        <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
      )}

      <span>{isLoading ? 'Autenticando...' : label}</span>
    </button>
  );
}
