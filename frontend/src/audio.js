// Single Audio element shared across the entire app.
// Never create another — two instances cause the "dual voice" seek bug.
const audio = new Audio()
audio.preload = 'auto'
audio.crossOrigin = 'anonymous'
export default audio
