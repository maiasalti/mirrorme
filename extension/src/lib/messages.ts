/** Typed message contracts between popup ⇄ background ⇄ content script. */

export type PendingGarment = {
  url: string // http(s) URL or data: URL of the selected garment image
  auto: boolean // true when found by auto-detect, false when user-clicked
  pageUrl: string
  at: number
}

export type Msg =
  | { type: 'START_SELECT' } // popup → background: inject picker on active tab
  | { type: 'AUTO_DETECT' } // popup → background: inject + auto-detect
  | { type: 'ENTER_SELECT_MODE' } // background → content
  | { type: 'RUN_AUTO_DETECT' } // background → content
  | { type: 'GARMENT_SELECTED'; url: string; auto: boolean } // content → background
  | { type: 'AUTO_DETECT_FAILED' } // content → background → popup may prompt manual
  | { type: 'GET_PENDING_GARMENT' } // popup → background
  | { type: 'CLEAR_PENDING_GARMENT' } // popup → background

export type GetPendingResponse = { pending: PendingGarment | null }

export const sendMessage = <R = void>(msg: Msg): Promise<R> =>
  chrome.runtime.sendMessage(msg)
