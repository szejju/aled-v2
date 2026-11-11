/** Akcent protokołu: liga limonkowa, puchar fioletowy, lato żółte. */
export type ProtocolTone = 'lime' | 'purple' | 'yellow'

export const protocolTone: Record<ProtocolTone, {
  text: string
  avatar: string
  focus: string
  button: string
}> = {
  lime: {
    text: 'text-lime',
    avatar: 'bg-lime/10 text-lime ring-1 ring-lime/30',
    focus: 'focus:border-lime',
    button: 'bg-lime text-on-lime',
  },
  purple: {
    text: 'text-purple-400',
    avatar: 'bg-purple-400/10 text-purple-400 ring-1 ring-purple-400/30',
    focus: 'focus:border-purple-400',
    button: 'bg-purple-500 text-white',
  },
  yellow: {
    text: 'text-yellow-400',
    avatar: 'bg-yellow-400/10 text-yellow-400 ring-1 ring-yellow-400/30',
    focus: 'focus:border-yellow-400',
    button: 'bg-yellow-400 text-on-lime',
  },
}
