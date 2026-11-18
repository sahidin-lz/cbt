import React from 'react';
import { ExamManagementTab } from '../ExamManagementTab';
import { useAdminDashboard } from '../../context/AdminDashboardContext';

export const AdminLiveMonitorTab: React.FC = () => {
  const {
    exams,
    questions,
    students,
    results,
    onRefreshData,
    handleUpdateStudentStatus,
    handleBatchDistributePackages,
  } = useAdminDashboard();

  return (
    <ExamManagementTab
      exams={exams}
      questions={questions}
      students={students}
      results={results}
      onRefreshData={onRefreshData}
      onUpdateStudentStatus={handleUpdateStudentStatus}
      onBatchDistributePackages={handleBatchDistributePackages}
    />
  );
};

export default AdminLiveMonitorTab;
