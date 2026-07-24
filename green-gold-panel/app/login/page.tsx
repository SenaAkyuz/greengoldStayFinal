import LoginForm from './LoginForm';

// Server Component: demo butonu görünürlüğü SUNUCUDA hesaplanır.
// Client'a yalnızca boolean bayrak geçer — kimlik bilgisi asla gitmez.
export default function LoginPage() {
  const demoEnabled =
    process.env.DEMO_LOGIN_ENABLED === 'true' &&
    !!process.env.DEMO_LOGIN_EMAIL &&
    !!process.env.DEMO_LOGIN_PASSWORD;

  return <LoginForm demoEnabled={demoEnabled} />;
}
