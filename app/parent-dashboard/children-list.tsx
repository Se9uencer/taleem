"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { School, User } from "lucide-react"

interface ChildrenListProps {
  children: any[]
  onViewProgress: (childId: string) => void
  selectedChildId: string | null
}

export function ChildrenList({ children, onViewProgress, selectedChildId }: ChildrenListProps) {
  if (children.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 mb-2">You haven't linked any children yet.</p>
        <p className="text-sm text-gray-400">Use the form above to link your child's account using their student ID.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {children.map((child) => (
        <Card
          key={child.id}
          className={`overflow-hidden ${selectedChildId === child.id ? "ring-2 ring-purple-500" : ""}`}
        >
          <CardContent className="p-0">
            <div className="bg-purple-50 p-4">
              <h3 className="font-medium text-lg flex items-center gap-2">
                <User className="h-5 w-5 text-purple-600" />
                {child.first_name} {child.last_name}
              </h3>
              <p className="text-sm text-gray-500">Student ID: {child.student_id}</p>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <h4 className="text-sm font-medium text-gray-700 flex items-center gap-1.5 mb-1">
                  <School className="h-4 w-4 text-purple-600" />
                  Classes Enrolled
                </h4>
                {child.classes && child.classes.length > 0 ? (
                  <ul className="text-sm text-gray-600 space-y-1 pl-6">
                    {child.classes.map((cls: any) => (
                      <li key={cls.id} className="list-disc">
                        {cls.name} {cls.grade_level && `(Grade ${cls.grade_level})`}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500 pl-6">Not enrolled in any classes</p>
                )}
              </div>

              <Button
                onClick={() => onViewProgress(child.id)}
                className="w-full"
                variant={selectedChildId === child.id ? "secondary" : "default"}
              >
                {selectedChildId === child.id ? "Currently Viewing" : "View Progress"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
