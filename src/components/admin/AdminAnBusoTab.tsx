import React from 'react';
import { AnBusoAnalysisTab } from '../AnBusoAnalysisTab';
import { useAdminDashboard } from '../../context/AdminDashboardContext';

export const AdminAnBusoTab: React.FC = () => {
  const { exams, questions, students, results, teacherProfile } = useAdminDashboard();

  return (
    <AnBusoAnalysisTab
      exams={exams}
      questions={questions}
      students={students}
      results={results}
      teacherName={teacherProfile.name}
    />
  );
};

export default AdminAnBusoTab;
