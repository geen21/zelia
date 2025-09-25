import React, { useState, useEffect } from 'react'
import { activitiesAPI } from '../lib/api'

export default function ActivitiesExample() {
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newActivity, setNewActivity] = useState({
    title: '',
    description: '',
    category: ''
  })

  useEffect(() => {
    fetchActivities()
  }, [])

  const fetchActivities = async () => {
    try {
      setLoading(true)
      const response = await activitiesAPI.getAll({ limit: 10 })
      setActivities(response.data.activities || [])
    } catch (err) {
      setError('Failed to load activities: ' + (err.response?.data?.error || err.message))
    } finally {
      setLoading(false)
    }
  }

  const handleCreateActivity = async (e) => {
    e.preventDefault()
    try {
      const response = await activitiesAPI.create(newActivity)
      setActivities([response.data.activity, ...activities])
      setNewActivity({ title: '', description: '', category: '' })
      alert('Activity created successfully!')
    } catch (err) {
      alert('Failed to create activity: ' + (err.response?.data?.error || err.message))
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-lg">Loading activities...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Activities Management</h1>
      
      {/* Create Activity Form */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Create New Activity</h2>
        <form onSubmit={handleCreateActivity} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title
            </label>
            <input
              type="text"
              value={newActivity.title}
              onChange={(e) => setNewActivity({...newActivity, title: e.target.value})}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={newActivity.description}
              onChange={(e) => setNewActivity({...newActivity, description: e.target.value})}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows="3"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            <select
              value={newActivity.category}
              onChange={(e) => setNewActivity({...newActivity, category: e.target.value})}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a category</option>
              <option value="sports">Sports</option>
              <option value="education">Education</option>
              <option value="culture">Culture</option>
              <option value="technology">Technology</option>
              <option value="social">Social</option>
            </select>
          </div>
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Create Activity
          </button>
        </form>
      </div>

      {/* Activities List */}
      <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Recent Activities</h2>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {activities.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            No activities found. Create the first one!
          </p>
        ) : (
          <div className="space-y-4">
            {activities.map((activity) => (
              <div key={activity.id} className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold">{activity.title}</h3>
                {activity.description && (
                  <p className="text-gray-600 mt-2">{activity.description}</p>
                )}
                {activity.category && (
                  <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded mt-2">
                    {activity.category}
                  </span>
                )}
                <p className="text-sm text-gray-500 mt-2">
                  Created: {new Date(activity.created_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
