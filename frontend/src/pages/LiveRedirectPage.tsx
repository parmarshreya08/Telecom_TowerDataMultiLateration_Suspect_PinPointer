import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { MOCK_INVESTIGATIONS } from '@/mock/investigations'

/** Redirects to the most recent active investigation's live page. */
export default function LiveRedirectPage() {
  const navigate = useNavigate()

  useEffect(() => {
    const active = MOCK_INVESTIGATIONS.find((i) => i.tracking_status === 'Live' || i.status === 'Active')
    if (active) {
      navigate(`/investigations/${active.id}/live`, { replace: true })
    } else {
      navigate('/investigations', { replace: true })
    }
  }, [navigate])

  return null
}
