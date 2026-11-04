// client/src/pages/LoginPage.tsx
import React, { useState } from 'react';
import { Hexagon, Lock, ShieldCheck } from 'lucide-react';
import { apiClient } from '../lib/apiClient';
import { toUserSession } from '../lib/authSession';
import { UserSession } from '../types/erp';

export const LoginPage: React.FC<{
    onAuthenticated: (session: UserSession) => void;
}> = ({ onAuthenticated }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const res = await apiClient.request<{
                token?: string;
                user: {
                    id?: string;
                    _id?: string;
                    email: string;
                    fullName?: string;
                    role?: string;
                    permissions?: string[];
                };
            }>('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password }),
            });

            if (res.token) {
                window.sessionStorage.setItem('buram_jwt', res.token);
            }

            onAuthenticated(toUserSession(res.user));
        } catch (loginError) {
            setError(
                loginError instanceof Error
                    ? loginError.message
                    : 'Authentication failed. Check your credentials and try again.'
            );
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-buram-bg flex items-center justify-center p-4 bg-honeycomb-header">
            <div className="max-w-md w-full bg-buram-surface border border-buram-border rounded-lg p-8 shadow-panel">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-11 h-11 rounded bg-buram-amber/15 border border-buram-amber flex items-center justify-center shadow-amberGlow">
                        <Hexagon className="w-6 h-6 text-buram-amber fill-buram-amber/20" />
                    </div>
                    <div>
                        <h1 className="text-lg font-mono font-bold tracking-wider text-buram-text">
                            BURAMLOOP ERP
                        </h1>
                        <p className="text-xs font-mono text-buram-muted">
                            HENNIGSDORF • HONEY OPERATIONS INTELLIGENCE
                        </p>
                    </div>
                </div>

                <form onSubmit={handleLogin} className="space-y-4 font-mono text-xs">
                    <div>
                        <label className="block text-buram-muted uppercase mb-1">
                            Operator Email
                        </label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-buram-bg border border-buram-border rounded px-3.5 py-2.5 text-buram-text focus:border-buram-amber"
                        />
                    </div>

                    <div>
                        <label className="block text-buram-muted uppercase mb-1">
                            Security Passkey
                        </label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-buram-bg border border-buram-border rounded px-3.5 py-2.5 text-buram-text focus:border-buram-amber"
                        />
                    </div>

                    {error && (
                        <div className="p-2.5 rounded bg-buram-critical/15 border border-buram-critical/50 text-buram-critical">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-2.5 rounded bg-buram-amber text-buram-ink font-bold uppercase tracking-wider hover:bg-buram-gold shadow-amberGlow flex items-center justify-center gap-2"
                    >
                        <Lock className="w-3.5 h-3.5" />
                        <span>{isLoading ? 'Authenticating Session...' : 'Initialize Mission Control'}</span>
                    </button>
                </form>

                <div className="mt-6 pt-4 border-t border-buram-border/60 flex items-center justify-between text-[11px] font-mono text-buram-muted">
                    <span className="inline-flex items-center gap-1 text-buram-success">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        RBAC + JWT httpOnly
                    </span>
                    <span>1 DRUM = 290.0 KG</span>
                </div>
            </div>
        </div>
    );
};