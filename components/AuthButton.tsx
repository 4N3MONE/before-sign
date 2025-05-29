"use client"

import React, { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { LogIn, LogOut, User, History } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface AuthButtonProps {
  onHistoryToggle?: () => void
}

export function AuthButton({ onHistoryToggle }: AuthButtonProps) {
  const { user, loading, signInWithGoogle, signOut } = useAuth()
  const { t } = useTranslation()
  const [isSigningIn, setIsSigningIn] = useState(false)

  const handleSignIn = async () => {
    setIsSigningIn(true)
    try {
      await signInWithGoogle()
    } catch (error) {
      console.error('Sign in failed:', error)
    } finally {
      setIsSigningIn(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Sign out failed:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center space-x-2">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user) {
    return (
      <Button
        onClick={handleSignIn}
        disabled={isSigningIn}
        variant="outline"
        className="bg-white hover:bg-gray-50 border-gray-300 text-gray-700"
      >
        {isSigningIn ? (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
        ) : (
          <LogIn className="h-4 w-4 mr-2" />
        )}
        {isSigningIn ? 'Signing in...' : 'Sign in with Google'}
      </Button>
    )
  }

  const getUserInitials = (name: string | null) => {
    if (!name) return 'U'
    return name
      .split(' ')
      .map(part => part.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full">
          <Avatar className="h-10 w-10">
            <AvatarImage src={user.photoURL || ''} alt={user.displayName || 'User'} />
            <AvatarFallback className="bg-blue-100 text-blue-600">
              {getUserInitials(user.displayName)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <div className="flex items-center justify-start space-x-2 p-2">
          <div className="flex flex-col space-y-1 leading-none">
            {user.displayName && (
              <p className="font-medium text-sm text-gray-900">
                {user.displayName}
              </p>
            )}
            <p className="text-xs text-gray-500">
              {user.email}
            </p>
          </div>
        </div>
        <DropdownMenuSeparator />
        {onHistoryToggle && (
          <>
            <DropdownMenuItem onClick={onHistoryToggle}>
              <History className="mr-2 h-4 w-4" />
              <span>Document History</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
} 