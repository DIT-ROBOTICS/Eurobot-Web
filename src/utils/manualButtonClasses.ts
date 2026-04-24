/** Tactile press; shared with Robot Status Manual control and Control Panel primary actions. */
export const MANUAL_CTRL_BTN_BASE =
  "select-none touch-manipulation " +
  "transition-transform duration-100 ease-out motion-reduce:transition-none " +
  "active:scale-[0.97] active:brightness-[0.92] motion-reduce:active:scale-100 motion-reduce:active:brightness-100 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/30 focus-visible:outline-offset-2 " +
  "disabled:active:scale-100 disabled:active:brightness-100 disabled:active:filter-none";

export const MANUAL_CTRL_NEUTRAL =
  "w-full min-w-0 rounded-md border border-white/20 bg-[#2a2a2a] py-4 px-3 text-center text-lg font-bold tracking-wider text-white sm:px-4 sm:text-2xl " +
  MANUAL_CTRL_BTN_BASE;

export const MANUAL_CTRL_ACCENT =
  "w-full min-w-0 rounded-md border border-transparent py-4 px-3 text-center text-lg font-bold tracking-wider text-white sm:px-4 sm:text-2xl " +
  MANUAL_CTRL_BTN_BASE;

export const FILE_INPUT_PICKER_CLASS =
  "w-full text-[1.35rem] text-inherit sm:text-[1.4rem] " +
  "file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:py-4 file:px-5 " +
  "file:text-center file:font-bold file:tracking-wider file:text-2xl file:text-white " +
  "file:bg-[#2a2a2a] file:transition file:duration-100 " +
  "file:active:scale-[0.98] file:active:brightness-[0.9] " +
  "file:focus-visible:outline file:focus-visible:outline-2 file:focus-visible:outline-white/30 file:focus-visible:outline-offset-2 " +
  "hover:file:bg-[#343434]";

/** Control row: tall enough for `text-xl` / `text-2xl` labels; pairs with `.control-panel .control-input` */
export const CONTROL_ACCENT_BTN =
  "inline-flex h-16 min-h-16 w-full items-center justify-center rounded-md border border-transparent px-5 text-xl font-bold tracking-wider text-white sm:min-w-[8.5rem] sm:text-2xl sm:w-auto " +
  MANUAL_CTRL_BTN_BASE;

export const CONTROL_NEUTRAL_BTN =
  "inline-flex h-16 min-h-16 w-full items-center justify-center rounded-md border border-white/20 bg-[#2a2a2a] px-5 text-xl font-bold tracking-wider text-white sm:min-w-[6.5rem] sm:text-2xl sm:w-auto " +
  MANUAL_CTRL_BTN_BASE;
