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
    getKkmForKelas,
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
      getKkmForKelas={getKkmForKelas}
    />
  );
};

export default AdminLiveMonitorTab;
