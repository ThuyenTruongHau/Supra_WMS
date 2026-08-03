import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  UserOutlined,
  LockOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
} from '@ant-design/icons'
import { loginSchema, LoginRequest } from '@/types/auth'
import { useLogin } from '@/hooks/useAuth'
import thadoLogo from '@/assets/logos/thado_logo.svg'
import loginBg from '@/assets/images/login_bg.jpg'

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const { mutate: login, isPending, error } = useLogin()

  const { register, handleSubmit, formState: { errors, isSubmitting }, }
    = useForm<LoginRequest>({
      resolver: zodResolver(loginSchema),
      defaultValues: { username: '', password: '' },
    })

  const Login = (data: LoginRequest) => {
    login(data)
  }

  return (
    <div
      className="relative flex h-screen w-full items-center justify-center overflow-hidden bg-cover bg-center"
      style={{ backgroundImage: `url(${loginBg})` }}
    >
      {/* Background Overlay */}
      <div className="absolute inset-0 z-10 bg-white/18" />

      {/* Industrial Pattern Overlay */}
      <div className="bg-industrial-pattern pointer-events-none absolute inset-0 z-20" />

      <div className="relative z-30 w-full max-w-[420px] px-4 md:max-w-[90%] lg:max-w-[420px]">
        <div className="rounded-[10px] bg-white px-6 py-8 shadow-[0_8px_32px_rgba(0,0,0,0.1),0_2px_8px_rgba(0,0,0,0.06)] sm:px-9 sm:pt-10 sm:pb-8">
          <div className="mb-5 flex justify-center">
            <img
              src={thadoLogo}
              alt="thado_logo"
              className="h-auto w-auto object-contain"
            />
          </div>

          <h1 className="mb-1 text-center text-2xl font-bold text-brand-dark sm:text-[26px]">
            Đăng nhập
          </h1>
          <p className="mb-8 text-center text-sm text-gray-500">
            Chào mừng đến hệ thống quản lý kho
          </p>

          {error && (
            <div className="mb-5 text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg p-3 text-center font-medium">
              Đăng nhập thất bại. Vui lòng kiểm tra lại tài khoản và mật khẩu.
            </div>
          )}

          <form
            className="space-y-5"
            onSubmit={handleSubmit(Login)}
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="username" className="text-sm font-semibold text-gray-800">
                Tài khoản:
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-gray-400 flex items-center pointer-events-none">
                  <UserOutlined />
                </span>
                <input
                  id="username"
                  type="text"
                  placeholder="Nhập tài khoản"
                  disabled={isPending || isSubmitting}
                  {...register('username')}
                  className={`h-11 w-full rounded-lg border bg-white pl-10 pr-3 text-sm outline-none transition-all placeholder:text-gray-400 hover:border-brand-primary focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15 disabled:cursor-not-allowed disabled:bg-gray-50 ${errors.username
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500/15'
                    : 'border-gray-300'
                    }`}
                />
              </div>
              {errors.username && (
                <span className="text-xs text-red-500">{errors.username.message}</span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-semibold text-gray-800">
                Mật khẩu:
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-gray-400 flex items-center pointer-events-none">
                  <LockOutlined />
                </span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Nhập mật khẩu"
                  disabled={isPending || isSubmitting}
                  {...register('password')}
                  className={`h-11 w-full rounded-lg border bg-white pl-10 pr-10 text-sm outline-none transition-all placeholder:text-gray-400 hover:border-brand-primary focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15 disabled:cursor-not-allowed disabled:bg-gray-50 ${errors.password
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500/15'
                    : 'border-gray-300'
                    }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={isPending || isSubmitting}
                  className="absolute right-3.5 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none disabled:cursor-not-allowed"
                >
                  {showPassword ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                </button>
              </div>
              {errors.password && (
                <span className="text-xs text-red-500">{errors.password.message}</span>
              )}
            </div>

            <button
              type="submit"
              className="mt-2 h-[45px] w-full cursor-pointer rounded-lg border-none bg-linear-to-br from-brand-dark to-brand-primary text-base font-bold text-white transition-all hover:brightness-112 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:filter-none"
              disabled={isPending || isSubmitting}
            >
              {isPending ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </form>

          <div className="mt-[18px] text-center">
            <a
              href="#"
              className="text-[13px] text-brand-primary transition-colors hover:text-brand-dark hover:underline"
            >
              Quên mật khẩu
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

