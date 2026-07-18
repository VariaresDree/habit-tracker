// Inert stand-in for 'virtual:pwa-register/react' in vitest, where the
// vite-plugin-pwa virtual module isn't generated. Wired via test.alias.
export function useRegisterSW() {
  return {
    needRefresh: [false, () => {}] as [boolean, (v: boolean) => void],
    offlineReady: [false, () => {}] as [boolean, (v: boolean) => void],
    updateServiceWorker: async (_reload?: boolean) => {},
  };
}
