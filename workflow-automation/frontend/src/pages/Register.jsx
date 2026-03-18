import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Zap, User, Mail, Lock, ArrowRight, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(form);
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-blue-900/30">
            <Zap size={26} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>WorkflowOS</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Create your account</p>
        </div>

        <div className="rounded-2xl border p-8 shadow-xl" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { key: 'name', label: 'Name', type: 'text', icon: User, placeholder: 'John Doe' },
              { key: 'email', label: 'Email', type: 'email', icon: Mail, placeholder: 'you@example.com' },
              { key: 'password', label: 'Password', type: 'password', icon: Lock, placeholder: 'Min 6 characters' }
            ].map(({ key, label, type, icon: Icon, placeholder }) => (
              <div key={key}>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{label}</label>
                <div className="relative">
                  <Icon size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                  <input
                    type={key === 'password' ? (showPassword ? 'text' : 'password') : type} required
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className={`w-full pl-9 ${key === 'password' ? 'pr-10' : 'pr-4'} py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all`}
                    style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    placeholder={placeholder}
                  />
                  {key === 'password' && (
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-white/10 transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button
              type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white disabled:opacity-50 transition-all shadow-lg shadow-blue-900/30 mt-2"
            >
              {loading ? 'Creating…' : <><span>Create account</span><ArrowRight size={15} /></>}
            </button>
          </form>
          <p className="text-center text-sm mt-6" style={{ color: 'var(--text-muted)' }}>
            Have an account?{' '}
            <Link to="/login" className="text-blue-500 hover:text-blue-400 font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
