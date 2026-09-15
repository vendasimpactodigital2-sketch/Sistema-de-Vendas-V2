import {StrictMode, Component, ErrorInfo, ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// 1. Fallback robusto para localStorage/sessionStorage (vital para navegadores de celular em modo privado/guia anônima)
if (typeof window !== 'undefined') {
  let storageAvailable = false;
  try {
    const testKey = '__storage_test_key__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    storageAvailable = true;
  } catch (e) {
    storageAvailable = false;
  }

  if (!storageAvailable) {
    console.warn('window.localStorage não está disponível ou está restrito. Ativando polyfill em memória.');
    const mockStorage: Record<string, string> = {};
    const localPolyfill = {
      getItem: (key: string) => (key in mockStorage ? mockStorage[key] : null),
      setItem: (key: string, value: string) => { mockStorage[key] = String(value); },
      removeItem: (key: string) => { delete mockStorage[key]; },
      clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); },
      key: (index: number) => Object.keys(mockStorage)[index] || null,
      get length() { return Object.keys(mockStorage).length; }
    };
    try {
      Object.defineProperty(window, 'localStorage', { value: localPolyfill, writable: true, configurable: true });
    } catch (err) {
      try {
        (window as any).localStorage = localPolyfill;
      } catch (err2) {
        console.error('Falhou ao atribuir polyfill para localStorage:', err2);
      }
    }
  }

  // Silenciar mensagens e rejeições de conexões WebSocket do HMR (Vite) no Sandbox de Nuvem
  window.addEventListener('unhandledrejection', (event) => {
    const message = event.reason?.message || String(event.reason);
    if (message.includes('WebSocket') || message.includes('websocket') || message.includes('closed without opened')) {
      event.preventDefault(); // Silencia o erro de rejeição não tratada no console
    }
  });

  const originalConsoleError = window.console.error;
  window.console.error = (...args) => {
    const logMessage = args.map(arg => (arg instanceof Error ? arg.message : String(arg))).join(' ');
    if (
      logMessage.includes('[vite] failed to connect to websocket') || 
      logMessage.includes('WebSocket connection to') ||
      logMessage.includes('WebSocket closed without opened')
    ) {
      return; // Ignora logs benignos de conexão websocket do Vite HMR
    }
    originalConsoleError.apply(window.console, args);
  };
}

// 2. Componente de ErrorBoundary para auto-recuperação de falhas em tela preta (erros de render)
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Erro capturado por ErrorBoundary:", error, errorInfo);
  }

  private handleClearAndReload = () => {
    try {
      localStorage.clear();
      window.location.reload();
    } catch (e) {
      alert("Não foi possível limpar os dados locais: " + String(e));
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh",
          backgroundColor: "#080c14",
          color: "#f8fafc",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          fontFamily: "system-ui, -apple-system, sans-serif",
          textAlign: "center"
        }}>
          <div style={{
            maxWidth: "480px",
            width: "100%",
            backgroundColor: "#0f172a",
            border: "1px solid #1e293b",
            borderRadius: "16px",
            padding: "32px",
            boxShadow: "0 10px 25px -5px rgba(0,0,0,0.5)"
          }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚠️</div>
            <h1 style={{
              fontSize: "18px",
              fontWeight: 700,
              color: "#ffffff",
              marginBottom: "12px",
              textTransform: "uppercase",
              letterSpacing: "0.05em"
            }}>Ops! Algo deu errado</h1>
            <p style={{
              fontSize: "12px",
              color: "#94a3b8",
              lineHeight: "1.6",
              marginBottom: "20px"
            }}>
              Ocorreu uma falha ao iniciar os módulos visuais no seu navegador. 
              Isso pode ser resolvido recarregando o aplicativo ou limpando os dados temporários locais salvos.
            </p>
            
            {this.state.error && (
              <div style={{
                textAlign: "left",
                fontFamily: "monospace",
                fontSize: "10px",
                backgroundColor: "#020617",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid #334155",
                color: "#f43f5e",
                overflowX: "auto",
                marginBottom: "24px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all"
              }}>
                <strong>Detalhes do erro:</strong> {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  width: "100%",
                  padding: "10px 16px",
                  backgroundColor: "#00b6ff",
                  color: "#080c14",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                  textTransform: "uppercase"
                }}
              >
                Recarregar Aplicativo
              </button>
              <button
                onClick={this.handleClearAndReload}
                style={{
                  width: "100%",
                  padding: "10px 16px",
                  backgroundColor: "rgba(255, 0, 127, 0.15)",
                  color: "#ff007f",
                  border: "1px solid rgba(255, 0, 127, 0.4)",
                  borderRadius: "8px",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                  textTransform: "uppercase"
                }}
              >
                Limpar Banco Temporário Local e Reiniciar
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
