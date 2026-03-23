'use client'

import { useEffect, useState } from 'react'

interface CountdownTimerProps {
  timeLeft: number
  totalTime: number
  size?: number
}

export function CountdownTimer({ timeLeft, totalTime, size = 80 }: CountdownTimerProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const progress = timeLeft / totalTime
  const dashOffset = circumference * (1 - progress)
  const isUrgent = timeLeft <= 5
  const center = size / 2

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={6}
        />
        {/* Progress arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={isUrgent ? '#E21B3C' : '#FFFFFF'}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={mounted ? dashOffset : 0}
          style={{
            transition: 'stroke-dashoffset 1s linear, stroke 0.3s ease',
          }}
        />
      </svg>
      {/* Number */}
      <div
        className={`absolute inset-0 flex items-center justify-center ${isUrgent ? 'animate-timer-pulse' : ''}`}
      >
        <span
          className="font-bold text-white"
          style={{ fontSize: size * 0.4 }}
        >
          {timeLeft}
        </span>
      </div>

      <style jsx>{`
        @keyframes timer-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
        .animate-timer-pulse {
          animation: timer-pulse 1s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
