import React from 'react'
import { motion } from 'framer-motion'

// Keep the AR overlays mounted while fading, and stop hidden controls from
// intercepting touches. Animate the child to preserve the overlay's layout.
const Fade = ({ when, duration = 300, delay = 0, top = false, children }) => (
  <motion.div
    initial={{ opacity: 0, y: top ? -20 : 0 }}
    animate={{ opacity: when ? 1 : 0, y: when || !top ? 0 : -20 }}
    transition={{ duration: duration / 1000, delay: delay / 1000 }}
    style={{ pointerEvents: when ? 'auto' : 'none' }}
    aria-hidden={!when}
  >
    {children}
  </motion.div>
)

export default Fade
