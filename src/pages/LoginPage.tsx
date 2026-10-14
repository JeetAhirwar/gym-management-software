import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "motion/react";
import {
  AlertTriangleIcon,
  BarChart3Icon,
  DumbbellIcon,
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  LockKeyholeIcon,
  QrCodeIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/auth/AuthProvider";
import { loginSchema, type LoginFormValues } from "@/lib/validation";
import { DEMO_CREDENTIALS } from "@/data";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1600&q=70";

export function LoginPage() {
  const { session, signIn, loading, mode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: mode === "demo" ? DEMO_CREDENTIALS.email : "", password: mode === "demo" ? DEMO_CREDENTIALS.password : "" },
  });

  if (!loading && session) return <Navigate to={from} replace />;

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await signIn(values.email.trim(), values.password);
      navigate(from, { replace: true });
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Sign in failed.");
    }
  });

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Editorial hero */}
      <section className="relative hidden overflow-hidden bg-[#0a0c0d] lg:block">
        <img
          src={HERO_IMAGE}
          alt="Members training in a modern gym"
          className="absolute inset-0 size-full object-cover opacity-45"
          loading="eager"
          onError={(event) => {
            (event.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0c0d] via-[#0a0c0d]/70 to-[#0a0c0d]/20" />
        <div className="relative z-10 flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <DumbbellIcon className="size-5" />
            </span>
            <span className="text-sm font-semibold tracking-wide">PULSE GYM SUITE</span>
          </div>

          <div className="max-w-lg">
            <div className="paper-surface paper-lift relative mb-8 inline-block rotate-[-1.2deg] px-6 py-3">
              <p className="font-serif text-lg tracking-tight">Front desk, meet your new superpower.</p>
            </div>
            <h1 className="text-5xl leading-[1.05] font-semibold tracking-tight text-balance">
              Run the whole gym from one screen.
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
              QR check-ins that reject the wrong members, memberships that renew themselves, receipts,
              schedules and analytics — all backed by your own Supabase database.
            </p>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-6 border-t border-white/10 pt-6">
              {[
                ["< 1s", "per QR check-in"],
                ["100%", "server-validated"],
                ["24/7", "audit trail"],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt className="text-2xl font-semibold text-primary">{value}</dt>
                  <dd className="mt-1 text-xs text-muted-foreground">{label}</dd>
                </div>
              ))}
            </dl>
          </div>

          <p className="text-xs text-muted-foreground">
            Photo by{" "}
            <a
              href="https://unsplash.com"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Unsplash
            </a>
          </p>
        </div>
      </section>

      {/* Sign-in card */}
      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-sm"
        >
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <DumbbellIcon className="size-5" />
            </span>
            <span className="font-semibold">Pulse Gym Suite</span>
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
            <p className="text-sm text-muted-foreground">
              Use your staff account to access the dashboard.
            </p>
          </div>

          {mode === "demo" ? (
            <Alert className="mt-6 border-warning/40 bg-warning/10">
              <AlertTriangleIcon className="size-4 text-warning" />
              <AlertTitle className="text-warning">Demo mode</AlertTitle>
              <AlertDescription>
                Local sample data is loaded. Credentials:{" "}
                <button
                  type="button"
                  className="font-medium text-foreground underline underline-offset-2"
                  onClick={() => {
                    setValue("email", DEMO_CREDENTIALS.email);
                    setValue("password", DEMO_CREDENTIALS.password);
                  }}
                >
                  {DEMO_CREDENTIALS.email} / {DEMO_CREDENTIALS.password}
                </button>
              </AlertDescription>
            </Alert>
          ) : null}

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            {serverError ? (
              <Alert variant="destructive" className="border-destructive/40">
                <LockKeyholeIcon className="size-4" />
                <AlertTitle>Sign in failed</AlertTitle>
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" placeholder="you@gym.com" {...register("email")} />
              {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                </button>
              </div>
              {errors.password ? <p className="text-xs text-destructive">{errors.password.message}</p> : null}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <ul className="mt-8 grid gap-3 border-t border-border/70 pt-6">
            {[
              { icon: QrCodeIcon, title: "QR check-ins", copy: "Scan, validate, done — no manual registers." },
              { icon: BarChart3Icon, title: "Live analytics", copy: "Revenue, attendance and renewals in real time." },
              { icon: ShieldCheckIcon, title: "Secure by design", copy: "Role-based access with row-level security." },
            ].map(({ icon: Icon, title, copy }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
                  <Icon className="size-4" />
                </span>
                <span>
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="block text-xs leading-relaxed text-muted-foreground">{copy}</span>
                </span>
              </li>
            ))}
          </ul>
        </motion.div>
      </section>
    </div>
  );
}
