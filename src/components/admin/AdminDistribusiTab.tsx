import React from 'react';
import { TokenAndDistributionTab } from '../TokenAndDistributionTab';
import { useAdminDashboard } from '../../context/AdminDashboardContext';

export const AdminDistribusiTab: React.FC = () => {
  const { exams, questions, students, results, onRefreshData } = useAdminDashboard();

  return (
    <TokenAndDistributionTab
      exams={exams}
      questions={questions}
      students={students}
      results={results}
      onRefreshData={onRefreshData}
    />
  );
};

export default AdminDistribusiTab;
