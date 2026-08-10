import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { investigationApi } from '@/services/api'

/** Redirects to the most recent active investigation's live page. */
export default function LiveRedirectPage() {
  const navigate = useNavigate()

  useEffect(() => {
    investigationApi
      .list()
      .then((res) => {
        const items = Array.isArray(res) ? res : res?.items ?? []
        if (items.length > 0) {
          navigate(`/investigations/${items[0].id}/live`, { replace: true })
        } else {
          navigate('/investigations', { replace: true })
        }
      })
      .catch(() => {
        navigate('/investigations', { replace: true })
      })
  }, [navigate])

  return null
}

